// GENERATED FILE - DO NOT EDIT.
// Vendored from packages/shared/src/receipt/receiptParser.ts by packages/shared/scripts/sync-vendored.mjs.
// Edit the source and re-run the script.

/**
 * Deterministic receipt parsing from raw OCR text (Backlog #122).
 *
 * Runs on the phone with no signal (after on-device text recognition) and on
 * the server as the fallback when no LLM is configured. It only ever proposes
 * values for a confirmation sheet — the traveller reviews before saving — so
 * the goal is a good first guess plus an honest `confidence`, not certainty.
 */

export const RECEIPT_CATEGORIES = [
  'food',
  'transportation',
  'lodging',
  'activities',
  'shopping',
  'other',
] as const;
export type ReceiptCategory = (typeof RECEIPT_CATEGORIES)[number];

export interface ParsedReceipt {
  amount: number | null;
  /** ISO 4217, upper-case. */
  currency: string | null;
  merchant: string | null;
  /** `YYYY-MM-DD` */
  date: string | null;
  category: ReceiptCategory;
  /** 0–1. Below ~0.5 the UI should prompt the user to check the amount. */
  confidence: number;
}

export interface ReceiptParseOptions {
  /** Currency to assume when the receipt names none (the trip's or the country's). */
  defaultCurrency?: string | null;
  /**
   * `DMY` (most of the world) or `MDY` (US) for ambiguous numeric dates like
   * 03/04/2026. Unambiguous dates (day > 12, ISO, month names) ignore this.
   */
  dateOrder?: 'DMY' | 'MDY';
}

/** Symbols that identify exactly one currency. `$`, `kr` and `¥` are ambiguous and handled apart. */
const SYMBOL_TO_CURRENCY: ReadonlyArray<[string, string]> = [
  ['€', 'EUR'],
  ['£', 'GBP'],
  ['₹', 'INR'],
  ['₩', 'KRW'],
  ['₺', 'TRY'],
  ['₫', 'VND'],
  ['฿', 'THB'],
  ['₱', 'PHP'],
  ['₪', 'ILS'],
  ['zł', 'PLN'],
  ['Kč', 'CZK'],
  ['R$', 'BRL'],
  ['CHF', 'CHF'],
  ['A$', 'AUD'],
  ['C$', 'CAD'],
  ['NZ$', 'NZD'],
  ['HK$', 'HKD'],
  ['S$', 'SGD'],
  ['US$', 'USD'],
];

const ISO_CODES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'ISK',
  'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'TRY', 'INR', 'THB', 'VND', 'IDR', 'MYR', 'SGD', 'HKD',
  'TWD', 'KRW', 'PHP', 'MXN', 'BRL', 'ARS', 'CLP', 'COP', 'PEN', 'ZAR', 'EGP', 'MAD', 'AED',
  'SAR', 'QAR', 'ILS', 'KES', 'TZS',
]);

/** Currencies conventionally written without minor units. */
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'IDR', 'CLP', 'ISK', 'HUF']);

const TOTAL_KEYWORDS =
  /\b(grand\s*total|total\s*due|amount\s*due|balance\s*due|total|totale|summe|gesamt|betrag|importe|montant|somme|à\s*payer|a\s*payer|te\s*betalen|totaal|合計|合计|総計)\b/i;
const NON_TOTAL_KEYWORDS =
  /\b(sub\s*-?total|subtotal|zwischensumme|sous-total|tax|vat|mwst|iva|tva|gst|tip|gratuity|service|change|cash|tendered|rendu|wechselgeld|discount|rabatt)\b/i;

const CATEGORY_KEYWORDS: ReadonlyArray<[ReceiptCategory, RegExp]> = [
  ['lodging', /\b(hotel|hostel|inn|resort|lodge|motel|guesthouse|b&b|airbnb|room\s*charge|nights?)\b/i],
  [
    'transportation',
    /\b(taxi|uber|lyft|grab|bolt|metro|subway|train|rail|bahn|sncf|trenitalia|renfe|bus|ferry|airline|airways|fuel|petrol|gas\s*station|parking|toll|fare|ticket\s*office)\b/i,
  ],
  [
    'food',
    /\b(restaurant|ristorante|trattoria|osteria|pizzeria|cafe|café|caffè|coffee|bar|bistro|brasserie|bakery|boulangerie|kitchen|grill|diner|sushi|ramen|izakaya|taverna|tapas|pub|menu|table|covers?|coperto|espresso|cappuccino|beer|wine|lunch|dinner|breakfast)\b/i,
  ],
  [
    'activities',
    /\b(museum|museo|musée|gallery|galleria|tour|admission|entrance|entry|ticket|billet|biglietto|eintritt|cinema|theatre|theater|zoo|aquarium|park|spa|rental)\b/i,
  ],
  [
    'shopping',
    /\b(market|supermarket|supermercato|store|shop|boutique|mall|pharmacy|farmacia|apotheke|souvenir|duty\s*free|outlet)\b/i,
  ],
];

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// A money-looking number: 12.50 | 1,234.56 | 1.234,56 | 1 234,56 | 1500
const AMOUNT_PATTERN = /(?<![\d.,])(\d{1,3}(?:[ .,']\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![\d])/g;

/**
 * Parse a money string in either decimal convention.
 *
 * The *last* separator is the decimal point when it is followed by exactly one
 * or two digits; every other separator is a thousands separator.
 */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[\s']/g, '');
  if (!/^\d[\d.,]*$/.test(cleaned)) return null;
  const lastSep = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(','));
  let normalized: string;
  if (lastSep === -1) {
    normalized = cleaned;
  } else {
    const decimals = cleaned.length - lastSep - 1;
    if (decimals === 1 || decimals === 2) {
      normalized = `${cleaned.slice(0, lastSep).replace(/[.,]/g, '')}.${cleaned.slice(lastSep + 1)}`;
    } else {
      normalized = cleaned.replace(/[.,]/g, '');
    }
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function detectCurrency(text: string, fallback: string | null): { currency: string | null; explicit: boolean } {
  // Explicit ISO code next to a number or on a total line wins.
  const iso = text.match(/\b([A-Z]{3})\b/g) ?? [];
  for (const code of iso) {
    if (ISO_CODES.has(code)) return { currency: code, explicit: true };
  }
  // Longest symbols first so "R$" is not read as "$".
  const symbols = [...SYMBOL_TO_CURRENCY].sort((a, b) => b[0].length - a[0].length);
  for (const [symbol, code] of symbols) {
    if (text.includes(symbol)) return { currency: code, explicit: true };
  }
  // Ambiguous symbols: prefer the caller's context, then the commonest reading.
  if (text.includes('¥') || text.includes('￥') || text.includes('円')) {
    return { currency: fallback === 'CNY' ? 'CNY' : 'JPY', explicit: true };
  }
  if (text.includes('$')) {
    const dollarZones = ['USD', 'CAD', 'AUD', 'NZD', 'SGD', 'HKD', 'MXN', 'TWD', 'ARS', 'CLP', 'COP'];
    return {
      currency: fallback && dollarZones.includes(fallback) ? fallback : 'USD',
      explicit: !fallback || dollarZones.includes(fallback),
    };
  }
  if (/\bkr\b/i.test(text)) {
    const kronor = ['SEK', 'NOK', 'DKK', 'ISK'];
    return { currency: fallback && kronor.includes(fallback) ? fallback : 'SEK', explicit: false };
  }
  return { currency: fallback, explicit: false };
}

const pad = (n: number): string => String(n).padStart(2, '0');

function validDate(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** First plausible date in the text, as `YYYY-MM-DD`. */
export function extractDate(text: string, dateOrder: 'DMY' | 'MDY' = 'DMY'): string | null {
  // ISO: 2026-11-04
  const iso = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(text);
  if (iso) {
    const r = validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (r) return r;
  }
  // 4 Nov 2026 / 04-Nov-26
  const dMonY = /\b(\d{1,2})[\s.-]*([A-Za-z]{3})[A-Za-z]*\.?[\s,.-]*(\d{2,4})\b/.exec(text);
  if (dMonY && MONTHS[dMonY[2].toLowerCase()]) {
    const r = validDate(Number(dMonY[3]), MONTHS[dMonY[2].toLowerCase()], Number(dMonY[1]));
    if (r) return r;
  }
  // Nov 4, 2026
  const monDY = /\b([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/.exec(text);
  if (monDY && MONTHS[monDY[1].toLowerCase()]) {
    const r = validDate(Number(monDY[3]), MONTHS[monDY[1].toLowerCase()], Number(monDY[2]));
    if (r) return r;
  }
  // 04/11/2026, 04.11.26 — order is locale-dependent unless one part exceeds 12.
  const numeric = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(text);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const y = Number(numeric[3]);
    let day: number;
    let month: number;
    if (a > 12) [day, month] = [a, b];
    else if (b > 12) [day, month] = [b, a];
    else [day, month] = dateOrder === 'MDY' ? [b, a] : [a, b];
    const r = validDate(y, month, day);
    if (r) return r;
  }
  return null;
}

function extractMerchant(lines: readonly string[]): string | null {
  for (const line of lines.slice(0, 6)) {
    const trimmed = line.trim();
    if (trimmed.length < 3 || trimmed.length > 60) continue;
    const letters = (trimmed.match(/\p{L}/gu) ?? []).length;
    // Skip lines that are mostly digits/punctuation (phone, VAT id, address numbers).
    if (letters < 3 || letters / trimmed.length < 0.5) continue;
    if (/\b(receipt|invoice|rechnung|quittung|ricevuta|scontrino|facture|ticket|tel|phone|www\.|http|vat|tax\s*id|p\.?\s*iva)\b/i.test(trimmed)) {
      continue;
    }
    return trimmed.replace(/\s{2,}/g, ' ');
  }
  return null;
}

function detectCategory(text: string): ReceiptCategory {
  for (const [category, pattern] of CATEGORY_KEYWORDS) {
    if (pattern.test(text)) return category;
  }
  return 'other';
}

/** Lines that hold a time, date or phone number rather than money. */
const looksNonMonetary = (line: string): boolean =>
  /\b\d{1,2}:\d{2}\b/.test(line) || /\b(tel|phone|fax|vat|iva|no\.|nr\.|#)\b/i.test(line);

/**
 * Extract `{ amount, currency, merchant, date, category, confidence }` from
 * OCR text.
 *
 * Amount strategy: a number on a line with a "total" keyword (and no
 * "subtotal/tax/tip" keyword) wins, preferring the last such line since grand
 * totals come last. Without one, fall back to the largest money-shaped number.
 */
export function parseReceiptText(text: string, options: ReceiptParseOptions = {}): ParsedReceipt {
  const normalized = (text ?? '').replace(/\r/g, '');
  const lines = normalized
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const { currency, explicit } = detectCurrency(normalized, options.defaultCurrency?.toUpperCase() ?? null);

  const amountsOn = (line: string): number[] =>
    [...line.matchAll(AMOUNT_PATTERN)]
      .map((m) => parseAmount(m[1]))
      .filter((n): n is number => n !== null && n > 0);

  let amount: number | null = null;
  let amountSource: 'total' | 'largest' | null = null;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!TOTAL_KEYWORDS.test(line) || NON_TOTAL_KEYWORDS.test(line)) continue;
    // OCR often splits "TOTAL" and its figure onto adjacent lines.
    const candidates = amountsOn(line);
    const found = candidates.length > 0 ? candidates : i + 1 < lines.length ? amountsOn(lines[i + 1]) : [];
    if (found.length > 0) {
      amount = found[found.length - 1];
      amountSource = 'total';
      break;
    }
  }

  if (amount === null) {
    const all = lines
      .filter((l) => !looksNonMonetary(l) && !NON_TOTAL_KEYWORDS.test(l))
      .flatMap((l) =>
        [...l.matchAll(AMOUNT_PATTERN)]
          // Without a keyword, only trust numbers that look like prices
          // (have decimals) unless the currency has no minor units.
          .filter((m) => /[.,]\d{1,2}$/.test(m[1]) || (currency !== null && ZERO_DECIMAL.has(currency)))
          .map((m) => parseAmount(m[1]))
          .filter((n): n is number => n !== null && n > 0)
      );
    if (all.length > 0) {
      amount = Math.max(...all);
      amountSource = 'largest';
    }
  }

  const date = extractDate(normalized, options.dateOrder ?? 'DMY');
  const merchant = extractMerchant(lines);
  const category = detectCategory(normalized);

  let confidence = 0;
  if (amountSource === 'total') confidence += 0.5;
  else if (amountSource === 'largest') confidence += 0.25;
  if (currency) confidence += explicit ? 0.2 : 0.1;
  if (date) confidence += 0.15;
  if (merchant) confidence += 0.15;

  return {
    amount: amount === null ? null : Math.round(amount * 100) / 100,
    currency,
    merchant,
    date,
    category,
    confidence: Math.round(Math.min(1, confidence) * 100) / 100,
  };
}
