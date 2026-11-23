/**
 * Capitalize the first letter of a string
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Words that read the same in the plural ("3 transport", not "3 transports"). */
const UNCOUNTABLE = new Set(['transport']);

/**
 * Plural of a display noun: "activity" -> "activities", "journal entry" -> "journal entries",
 * "stay" -> "stays". Only meant for the handful of entity names the managers use.
 */
export function pluralize(word: string): string {
  if (UNCOUNTABLE.has(word)) return word;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|ch|sh)$/.test(word)) return `${word}es`;
  return `${word}s`;
}
