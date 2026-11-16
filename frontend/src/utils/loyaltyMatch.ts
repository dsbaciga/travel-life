import type { LoyaltyProgram, LoyaltyProgramType } from '../types/loyaltyProgram';

/** The part of a program that matching needs. */
export type MatchableProgram = Pick<
  LoyaltyProgram,
  'id' | 'type' | 'providerName' | 'providerCode' | 'alliance' | 'aliases'
>;

export interface LoyaltyMatchQuery {
  /** Carrier, company or hotel name as typed on the booking. */
  name?: string | null;
  /** IATA code, when known. */
  code?: string | null;
  /** Flight number such as "DL 123": its leading two characters are the IATA code. */
  vehicleNumber?: string | null;
  /** Transportation type (flight, train, ...). Omit for lodging. */
  transportType?: string | null;
}

export type LoyaltyMatchKind = 'transportation' | 'lodging';

export interface LoyaltyMatch<P extends MatchableProgram> {
  program: P;
  /** 100 IATA code, 90 same name or alias, 70 one name contains the other, 50 alliance */
  score: number;
  reason: 'code' | 'name' | 'partial' | 'alliance';
}

/**
 * Words that decorate a brand without identifying it, so "Delta" and "Delta Air Lines", or
 * "Hilton" and "Hilton Hotels & Resorts", compare equal.
 */
const NOISE_WORDS = new Set([
  'air', 'airline', 'airlines', 'airways', 'airway', 'aviation', 'lines', 'line',
  'hotel', 'hotels', 'resort', 'resorts', 'inn', 'inns', 'suites', 'lodge',
  'international', 'intl', 'worldwide', 'global',
  'inc', 'ltd', 'llc', 'plc', 'co', 'corp', 'corporation', 'company', 'group',
  'the', 'and', 'of', 'by',
  'rail', 'railway', 'railways', 'railroad', 'trains',
  'rent', 'rental', 'rentals', 'car', 'cars',
]);

/** Lower-cases, strips accents and punctuation, and drops decorative words. */
export function normalizeProviderName(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const tokens = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
  const meaningful = tokens.filter((t) => !NOISE_WORDS.has(t));
  // A name made only of noise ("Hotel", "Air Lines") has no identity to match on
  return meaningful;
}

/** The IATA airline code at the start of a flight number: "dl 123" -> "DL". */
export function airlineCodeFromFlightNumber(flightNumber: string | null | undefined): string | null {
  if (!flightNumber) return null;
  // An IATA designator is two characters and always includes a letter ("DL", "9W"), which
  // keeps a bare number like "12345" from reading as carrier "12".
  const match = /^\s*([A-Za-z0-9]{2})\s*-?\s*\d{1,4}[A-Za-z]?\s*$/.exec(flightNumber);
  return match && /[A-Za-z]/.test(match[1]) ? match[1].toUpperCase() : null;
}

/** True when `needle` appears as a contiguous run of whole tokens inside `haystack`. */
function containsRun(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((t, j) => haystack[i + j] === t)) return true;
  }
  return false;
}

function sameTokens(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

/** Which program types make sense for a booking. */
function allowedTypes(kind: LoyaltyMatchKind, transportType?: string | null): LoyaltyProgramType[] {
  if (kind === 'lodging') return ['HOTEL', 'OTHER'];
  switch (transportType?.toLowerCase()) {
    case 'flight':
      return ['AIRLINE', 'OTHER'];
    case 'train':
      return ['RAIL', 'OTHER'];
    case 'car':
      return ['CAR_RENTAL', 'OTHER'];
    default:
      return ['AIRLINE', 'RAIL', 'CAR_RENTAL', 'OTHER'];
  }
}

function scoreProgram(
  program: MatchableProgram,
  queryTokens: string[],
  code: string | null
): Pick<LoyaltyMatch<MatchableProgram>, 'score' | 'reason'> | null {
  if (code && program.providerCode && program.providerCode.trim().toUpperCase() === code) {
    return { score: 100, reason: 'code' };
  }

  if (queryTokens.length === 0) return null;

  const names = [program.providerName, ...program.aliases].map(normalizeProviderName);

  if (names.some((n) => sameTokens(n, queryTokens))) {
    return { score: 90, reason: 'name' };
  }
  // "Hilton Garden Inn Boston Logan" contains "Hilton"; "Delta" is contained by "Delta Connection"
  if (names.some((n) => containsRun(queryTokens, n) || containsRun(n, queryTokens))) {
    return { score: 70, reason: 'partial' };
  }
  if (program.alliance && sameTokens(normalizeProviderName(program.alliance), queryTokens)) {
    return { score: 50, reason: 'alliance' };
  }
  return null;
}

/**
 * The programs that belong to a booking's carrier or hotel, best match first.
 * Pure: no I/O, so it is the one place the matching rules live and are tested.
 */
export function matchLoyaltyPrograms<P extends MatchableProgram>(
  programs: readonly P[],
  query: LoyaltyMatchQuery,
  kind: LoyaltyMatchKind
): LoyaltyMatch<P>[] {
  const types = allowedTypes(kind, query.transportType);
  const queryTokens = normalizeProviderName(query.name);
  const explicitCode = query.code?.trim().toUpperCase() || null;
  const code =
    explicitCode ?? (kind === 'transportation' ? airlineCodeFromFlightNumber(query.vehicleNumber) : null);

  const matches: LoyaltyMatch<P>[] = [];
  for (const program of programs) {
    if (!types.includes(program.type)) continue;
    const result = scoreProgram(program, queryTokens, code);
    if (result) matches.push({ program, ...result });
  }

  return matches.sort((a, b) => b.score - a.score || a.program.id - b.program.id);
}
