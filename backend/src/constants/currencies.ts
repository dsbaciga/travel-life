/**
 * Currencies exchange rates exist for: the ECB reference set published by Frankfurter.
 *
 * This is the backend's copy of the frontend `CONVERTIBLE_CURRENCIES` list
 * (`frontend/src/constants/currencies.ts`), which is what `CurrencySelect` offers.
 * **The two lists must be kept in step**: a code here that the form does not offer cannot
 * be picked, and one the form offers that is missing here would be rejected or dropped.
 * The frontend list is the source of truth.
 */
export const CONVERTIBLE_CURRENCY_CODES = [
  'AUD', 'BGN', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF',
  'IDR', 'ILS', 'INR', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN',
  'RON', 'SEK', 'SGD', 'THB', 'TRY', 'USD', 'ZAR',
] as const;

export type ConvertibleCurrencyCode = (typeof CONVERTIBLE_CURRENCY_CODES)[number];
