const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Turn a day key the Timeline and Day By Day views group by ("Mon, Jan 15, 2025",
 * or "Mon Jan 15 2025" when no trip timezone is set) into YYYY-MM-DD.
 *
 * Those keys were already formatted in the trip's timezone, so the calendar day
 * is read straight out of the text. It is deliberately not parsed into a `Date`:
 * that would re-interpret the day in the browser's zone.
 *
 * @returns the day, or null when the text is not a day key
 */
export function displayDayKeyToIso(key: string): string | null {
  const match = /([A-Z][a-z]{2})[ ]+(\d{1,2}),?[ ]+(\d{4})\s*$/.exec(key);
  if (!match) return null;
  const month = MONTHS.indexOf(match[1]);
  if (month < 0) return null;
  const pad = (n: string | number) => String(n).padStart(2, '0');
  return `${match[3]}-${pad(month + 1)}-${pad(match[2])}`;
}
