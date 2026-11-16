/**
 * Currencies the backend can fetch exchange rates for.
 *
 * This is the ECB reference set published by Frankfurter
 * (https://frankfurter.dev), the free no-key provider the backend uses.
 * Codes outside this list can still be typed into cost fields — they simply
 * cannot be converted, and the budget summary reports them as unconverted
 * rather than folding them into the total.
 *
 * This is the source of truth. The backend keeps its own copy of the codes in
 * `backend/src/constants/currencies.ts` (receipt scan, CSV import); **keep the two in step**.
 */
export const CONVERTIBLE_CURRENCIES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "AUD", label: "Australian Dollar" },
  { code: "BGN", label: "Bulgarian Lev" },
  { code: "BRL", label: "Brazilian Real" },
  { code: "CAD", label: "Canadian Dollar" },
  { code: "CHF", label: "Swiss Franc" },
  { code: "CNY", label: "Chinese Yuan" },
  { code: "CZK", label: "Czech Koruna" },
  { code: "DKK", label: "Danish Krone" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British Pound" },
  { code: "HKD", label: "Hong Kong Dollar" },
  { code: "HUF", label: "Hungarian Forint" },
  { code: "IDR", label: "Indonesian Rupiah" },
  { code: "ILS", label: "Israeli Shekel" },
  { code: "INR", label: "Indian Rupee" },
  { code: "ISK", label: "Icelandic Krona" },
  { code: "JPY", label: "Japanese Yen" },
  { code: "KRW", label: "South Korean Won" },
  { code: "MXN", label: "Mexican Peso" },
  { code: "MYR", label: "Malaysian Ringgit" },
  { code: "NOK", label: "Norwegian Krone" },
  { code: "NZD", label: "New Zealand Dollar" },
  { code: "PHP", label: "Philippine Peso" },
  { code: "PLN", label: "Polish Zloty" },
  { code: "RON", label: "Romanian Leu" },
  { code: "SEK", label: "Swedish Krona" },
  { code: "SGD", label: "Singapore Dollar" },
  { code: "THB", label: "Thai Baht" },
  { code: "TRY", label: "Turkish Lira" },
  { code: "USD", label: "US Dollar" },
  { code: "ZAR", label: "South African Rand" },
];
