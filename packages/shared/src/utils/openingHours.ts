import { formatInTimeZone } from 'date-fns-tz';

/**
 * OpeningHoursService — parse and evaluate OpenStreetMap `opening_hours` specifications.
 *
 * The full OSM opening_hours grammar is very large (holidays, month/week/year selectors,
 * variable times tied to sunrise/sunset, nth-weekday-of-month, fallback rules, comments…).
 * Implementing all of it correctly is a project in its own right, and a *wrong* answer here
 * is worse than no answer: telling a traveller a museum is open when it is closed defeats
 * the point, and crying wolf about a place that is actually open trains them to ignore the
 * warning. So this service implements a deliberately small, well-specified subset and
 * returns an explicit `UNKNOWN` for everything else instead of guessing.
 *
 * ── Supported ────────────────────────────────────────────────────────────────────────────
 * - `24/7`
 * - Weekday selectors: `Mo`, `Tu`, `We`, `Th`, `Fr`, `Sa`, `Su` (case-insensitive)
 * - Weekday ranges, including wrapping ones: `Mo-Fr`, `Sa-Su`, `Fr-Mo`
 * - Weekday lists and combinations: `Mo,We,Fr`, `Mo-We,Fr`
 * - Time ranges `HH:MM-HH:MM`, several per rule: `Mo-Fr 09:00-12:00,13:00-18:00`
 * - Time ranges with no weekday selector, meaning every day: `09:00-17:00`
 * - Ranges crossing midnight: `Fr-Sa 20:00-02:00` (the rule belongs to the day it *starts*)
 * - `24:00` as an end time, and `00:00-24:00` / `00:00-00:00` meaning the whole day
 * - `off` / `closed`, with or without a weekday selector: `Su off`
 * - Multiple rules separated by `;`
 * - `PH` / `SH` (public/school holiday) selectors — recognised, see the note below
 *
 * ── Deliberately NOT supported (any of these makes the whole spec UNKNOWN) ────────────────
 * - Month and date selectors: `Jan-Mar`, `Dec 25`, `Apr 01-Oct 31`
 * - Year and week selectors: `2026 Mo-Fr 09:00-17:00`, `week 1-10`
 * - Nth-weekday-of-month: `Mo[1]`, `Su[-1]`, `Sa[1,3]`
 * - Variable times: `sunrise`, `sunset`, `dawn`, `dusk`, `(sunset-01:00)`
 * - Open-ended times: `08:00+`
 * - Fallback rules (`||`) and additional-rule separators (`,` between whole rules)
 * - Comments in quotes: `Mo-Fr 09:00-17:00 "by appointment"`
 * - The `unknown` keyword
 * - Hours past 24:00 (`Mo 22:00-26:00`)
 * - A bare weekday selector with no time part (`Mo-Fr`)
 *
 * ── Rule precedence ──────────────────────────────────────────────────────────────────────
 * Per the OSM specification, rules separated by `;` *override* earlier rules for the days
 * they select — they are not additive. So `Mo-Fr 09:00-17:00; We off` closes Wednesday, and
 * (correctly but perhaps surprisingly) `Mo-Fr 09:00-12:00; Mo-Fr 13:00-17:00` describes a
 * place open only in the afternoon. Multiple intervals in one day belong in one rule,
 * comma-separated.
 *
 * ── Public / school holidays ─────────────────────────────────────────────────────────────
 * We have no holiday calendar, so for any given date we cannot know whether a `PH`/`SH`
 * rule applies. Rather than guess, a spec containing such a rule is evaluated twice: once
 * assuming the date is a holiday and once assuming it is not. If both readings agree the
 * answer is certain and is returned; if they disagree the result is `UNKNOWN`. This keeps
 * the common `Mo-Fr 09:00-17:00; PH off` useful on a Sunday (closed either way) while
 * refusing to commit on a Tuesday morning (open unless it happens to be a holiday).
 *
 * ── Timezone ─────────────────────────────────────────────────────────────────────────────
 * Opening hours are wall-clock times in the timezone of the *place*, which is neither UTC
 * nor the viewer's zone. Callers must pass the location's IANA timezone; the instant is
 * rendered into that zone with `date-fns-tz` before any weekday/minute arithmetic. An
 * unusable timezone yields `UNKNOWN`, never a fallback to UTC.
 */

/** Outcome of asking "is this place open at instant T?". */
export type OpeningStatus = 'OPEN' | 'CLOSED' | 'UNKNOWN';

export interface OpeningHoursEvaluation {
  status: OpeningStatus;
  /** Human-readable explanation, always present when status is `UNKNOWN`. */
  reason?: string;
}

/**
 * A half-open minute interval `[startMinutes, endMinutes)` measured from midnight of the
 * day the rule selects. `endMinutes` may exceed 1440 for ranges that cross midnight.
 */
interface TimeRange {
  startMinutes: number;
  endMinutes: number;
}

/** One `;`-separated rule of a specification. */
interface OpeningHoursRule {
  /** Weekdays this rule selects, 0 = Sunday … 6 = Saturday. Empty when `holiday` is true. */
  days: ReadonlySet<number>;
  /** True when the selector was `PH` or `SH` rather than weekdays. */
  holiday: boolean;
  /** True when the time part was `off` / `closed`. */
  closed: boolean;
  /** Intervals the place is open. Empty when `closed` is true. */
  ranges: readonly TimeRange[];
}

export type ParseResult =
  | { supported: true; rules: readonly OpeningHoursRule[] }
  | { supported: false; reason: string };

/** Wall-clock fields of an instant, as observed in some timezone. */
interface LocalFields {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** Minutes since local midnight. */
  minutes: number;
}

const MINUTES_PER_DAY = 1440;

/** OSM two-letter weekday abbreviations, indexed to match `Date#getUTCDay()`. */
const WEEKDAY_ORDER: readonly string[] = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];

const ALL_WEEKDAYS: ReadonlySet<number> = new Set([0, 1, 2, 3, 4, 5, 6]);

/** A single `HH:MM-HH:MM` interval. */
const TIME_RANGE_PATTERN = /^([0-9]{1,2}):([0-9]{2})-([0-9]{1,2}):([0-9]{2})$/;

/** A single weekday, a weekday range, or a holiday selector. */
const DAY_TERM_PATTERN = /^(mo|tu|we|th|fr|sa|su|ph|sh)(?:-(mo|tu|we|th|fr|sa|su))?$/;

/** `yyyy-MM-dd HH:mm` as produced by `formatInTimeZone` below. */
const LOCAL_STAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

export class OpeningHoursService {
  /**
   * Parse an OSM `opening_hours` specification into rules.
   *
   * Parsing is whitelist-based: every rule must match the supported grammar exactly. Any
   * construct outside the documented subset makes the whole specification unsupported,
   * which callers must surface as `UNKNOWN` rather than as "closed".
   */
  parse(spec: string): ParseResult {
    if (typeof spec !== 'string') {
      return { supported: false, reason: 'Opening hours specification is not a string' };
    }

    // Collapse whitespace and drop the spaces OSM permits around `,` and `-`, so that
    // the single remaining space in a rule always separates day part from time part.
    const normalized = spec
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*/g, ',')
      .replace(/\s*-\s*/g, '-')
      .replace(/\s*;\s*/g, ';')
      .trim();

    if (normalized.length === 0) {
      return { supported: false, reason: 'Opening hours specification is empty' };
    }

    if (normalized === '24/7') {
      return {
        supported: true,
        rules: [{ days: ALL_WEEKDAYS, holiday: false, closed: false, ranges: [{ startMinutes: 0, endMinutes: MINUTES_PER_DAY }] }],
      };
    }

    // `||` marks a fallback rule; splitting on `;` would silently mangle it.
    if (normalized.includes('||')) {
      return { supported: false, reason: 'Fallback rules (||) are not supported' };
    }

    const rules: OpeningHoursRule[] = [];
    for (const rawRule of normalized.split(';')) {
      const ruleText = rawRule.trim();
      if (ruleText.length === 0) continue; // tolerate a trailing or doubled `;`

      const parsedRule = this.parseRule(ruleText);
      if (parsedRule === null) {
        return { supported: false, reason: `Unsupported rule: "${ruleText}"` };
      }
      rules.push(parsedRule);
    }

    if (rules.length === 0) {
      return { supported: false, reason: 'Opening hours specification contains no rules' };
    }

    return { supported: true, rules };
  }

  /** True when `parse` can fully understand the specification. */
  isSupported(spec: string): boolean {
    return this.parse(spec).supported;
  }

  /**
   * Decide whether a place is open at a given instant.
   *
   * @param spec - Raw OSM `opening_hours` specification.
   * @param at - The instant to test (an absolute point in time, e.g. a stored UTC datetime).
   * @param timezone - IANA timezone of the *place*, e.g. `Europe/Paris`.
   * @returns `OPEN`, `CLOSED`, or `UNKNOWN` with a reason. Never guesses.
   */
  evaluate(spec: string, at: Date, timezone: string): OpeningHoursEvaluation {
    const parsed = this.parse(spec);
    // Compare against `false` rather than negating: the production tsconfig sets
    // `strict: false`, and with strictNullChecks off a truthiness test does not
    // narrow this discriminated union.
    if (parsed.supported === false) {
      return { status: 'UNKNOWN', reason: parsed.reason };
    }

    const local = this.getLocalFields(at, timezone);
    if (local === null) {
      return { status: 'UNKNOWN', reason: `Could not resolve "${timezone}" to a local time` };
    }

    const hasHolidayRule = parsed.rules.some((rule) => rule.holiday);
    const withoutHoliday = this.evaluateRules(parsed.rules, local, false);

    if (!hasHolidayRule) {
      return { status: withoutHoliday };
    }

    // No holiday calendar is available, so only commit when both readings agree.
    const withHoliday = this.evaluateRules(parsed.rules, local, true);
    if (withHoliday === withoutHoliday) {
      return { status: withoutHoliday };
    }

    return {
      status: 'UNKNOWN',
      reason: 'Result depends on public/school holiday rules, which cannot be resolved',
    };
  }

  // ===========================================================================
  // PARSING INTERNALS
  // ===========================================================================

  /** Parse one `;`-separated rule, or return null when it falls outside the subset. */
  private parseRule(ruleText: string): OpeningHoursRule | null {
    const separatorIndex = ruleText.indexOf(' ');

    // No space: either a bare time selector applying to every day, or a bare `off`.
    if (separatorIndex === -1) {
      if (this.isClosedKeyword(ruleText)) {
        return { days: ALL_WEEKDAYS, holiday: false, closed: true, ranges: [] };
      }
      const ranges = this.parseTimeSelector(ruleText);
      if (ranges === null) return null;
      return { days: ALL_WEEKDAYS, holiday: false, closed: false, ranges };
    }

    const dayPart = ruleText.slice(0, separatorIndex);
    const timePart = ruleText.slice(separatorIndex + 1).trim();

    // Any further space means a construct we do not model (month/date selectors,
    // comments, `open`/`unknown` modifiers, …).
    if (timePart.includes(' ')) return null;

    const daySelector = this.parseDaySelector(dayPart);
    if (daySelector === null) return null;

    if (this.isClosedKeyword(timePart)) {
      return { days: daySelector.days, holiday: daySelector.holiday, closed: true, ranges: [] };
    }

    const ranges = this.parseTimeSelector(timePart);
    if (ranges === null) return null;

    return { days: daySelector.days, holiday: daySelector.holiday, closed: false, ranges };
  }

  private isClosedKeyword(token: string): boolean {
    return token === 'off' || token === 'closed';
  }

  /**
   * Parse a weekday selector such as `mo-fr`, `mo,we,fr`, `fr-mo` (wrapping) or `ph`.
   *
   * A selector mixing holidays with weekdays (`ph,su`) is rejected: the two halves would
   * need different applicability handling, and it is rare enough not to justify guessing.
   */
  private parseDaySelector(dayPart: string): { days: ReadonlySet<number>; holiday: boolean } | null {
    const terms = dayPart.split(',');
    const days = new Set<number>();
    let sawHoliday = false;
    let sawWeekday = false;

    for (const term of terms) {
      const match = DAY_TERM_PATTERN.exec(term);
      if (match === null) return null;

      const [, first, second] = match;

      if (first === 'ph' || first === 'sh') {
        // `PH-Mo` is not a meaningful range.
        if (second !== undefined) return null;
        sawHoliday = true;
        continue;
      }

      sawWeekday = true;
      const startIndex = WEEKDAY_ORDER.indexOf(first);
      if (startIndex === -1) return null;

      if (second === undefined) {
        days.add(startIndex);
        continue;
      }

      const endIndex = WEEKDAY_ORDER.indexOf(second);
      if (endIndex === -1) return null;

      // Ranges wrap around the end of the week, so `Fr-Mo` is Fri, Sat, Sun, Mon.
      let cursor = startIndex;
      for (;;) {
        days.add(cursor);
        if (cursor === endIndex) break;
        cursor = (cursor + 1) % WEEKDAY_ORDER.length;
      }
    }

    if (sawHoliday && sawWeekday) return null;
    if (sawHoliday) return { days: new Set<number>(), holiday: true };
    if (days.size === 0) return null;

    return { days, holiday: false };
  }

  /** Parse a comma-separated list of `HH:MM-HH:MM` intervals. */
  private parseTimeSelector(timePart: string): TimeRange[] | null {
    const ranges: TimeRange[] = [];

    for (const token of timePart.split(',')) {
      const match = TIME_RANGE_PATTERN.exec(token);
      if (match === null) return null;

      const startMinutes = this.toMinutes(match[1], match[2]);
      const endMinutesRaw = this.toMinutes(match[3], match[4]);
      if (startMinutes === null || endMinutesRaw === null) return null;

      // A start of exactly 24:00 is meaningless.
      if (startMinutes >= MINUTES_PER_DAY) return null;

      // An end at or before the start wraps past midnight into the following day.
      // This also gives `00:00-00:00` its conventional meaning of "all day".
      const endMinutes = endMinutesRaw <= startMinutes ? endMinutesRaw + MINUTES_PER_DAY : endMinutesRaw;

      ranges.push({ startMinutes, endMinutes });
    }

    return ranges.length > 0 ? ranges : null;
  }

  /** Convert `HH` and `MM` strings to minutes since midnight, rejecting out-of-range values. */
  private toMinutes(hours: string, minutes: string): number | null {
    const hh = Number(hours);
    const mm = Number(minutes);
    if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
    // 24:00 is allowed as an end-of-day marker; anything beyond it is out of subset.
    if (hh < 0 || hh > 24 || mm < 0 || mm > 59) return null;
    if (hh === 24 && mm !== 0) return null;
    return hh * 60 + mm;
  }

  // ===========================================================================
  // EVALUATION INTERNALS
  // ===========================================================================

  /**
   * Render an instant into a timezone's wall clock.
   *
   * Formatting to a string and re-reading the fields avoids the classic trap of building a
   * shifted `Date` and reading its *system-local* getters, which misreports around DST
   * transitions. Returns null for an invalid instant or an unknown timezone.
   */
  private getLocalFields(at: Date, timezone: string): LocalFields | null {
    if (!(at instanceof Date) || Number.isNaN(at.getTime())) return null;
    if (typeof timezone !== 'string' || timezone.trim().length === 0) return null;

    let stamp: string;
    try {
      stamp = formatInTimeZone(at, timezone, 'yyyy-MM-dd HH:mm');
    } catch {
      return null;
    }

    const match = LOCAL_STAMP_PATTERN.exec(stamp);
    if (match === null) return null;

    const [, year, month, day, hours, minutes] = match;
    // Anchoring the calendar date at UTC midnight makes getUTCDay() a pure day-of-week
    // lookup, with no timezone of its own to interfere.
    const weekday = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay();

    return { weekday, minutes: Number(hours) * 60 + Number(minutes) };
  }

  /**
   * Apply the rules to a local wall-clock moment.
   *
   * @param holidayApplies - Whether to treat the date as a public/school holiday, which
   *   decides if `PH`/`SH` rules are in scope. Callers resolve the ambiguity, not this method.
   */
  private evaluateRules(
    rules: readonly OpeningHoursRule[],
    local: LocalFields,
    holidayApplies: boolean
  ): 'OPEN' | 'CLOSED' {
    // A rule that started yesterday can still be running (e.g. `Fr 20:00-02:00` at 01:00 Sat).
    const previousWeekday = (local.weekday + 6) % 7;

    const todayRule = this.findGoverningRule(rules, local.weekday, holidayApplies);
    if (todayRule !== null && this.covers(todayRule, local.minutes)) {
      return 'OPEN';
    }

    // Whether *yesterday* was a holiday is a separate unknown; reuse the caller's assumption,
    // which keeps the two-reading comparison in `evaluate` conservative either way.
    const yesterdayRule = this.findGoverningRule(rules, previousWeekday, holidayApplies);
    if (yesterdayRule !== null && this.covers(yesterdayRule, local.minutes + MINUTES_PER_DAY)) {
      return 'OPEN';
    }

    return 'CLOSED';
  }

  /**
   * Find the rule that decides a given weekday.
   *
   * OSM `;` semantics are last-match-wins, so a later rule replaces an earlier one for the
   * days it selects. Returns null when no rule mentions the day at all, which means closed.
   */
  private findGoverningRule(
    rules: readonly OpeningHoursRule[],
    weekday: number,
    holidayApplies: boolean
  ): OpeningHoursRule | null {
    let governing: OpeningHoursRule | null = null;

    for (const rule of rules) {
      const applies = rule.holiday ? holidayApplies : rule.days.has(weekday);
      if (applies) {
        governing = rule;
      }
    }

    return governing;
  }

  /** True when `minutes` (possibly ≥ 1440, i.e. spilling into the next day) falls in a rule's ranges. */
  private covers(rule: OpeningHoursRule, minutes: number): boolean {
    if (rule.closed) return false;
    return rule.ranges.some((range) => minutes >= range.startMinutes && minutes < range.endMinutes);
  }
}

export default new OpeningHoursService();
