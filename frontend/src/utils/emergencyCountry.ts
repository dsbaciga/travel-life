/**
 * Destination-country resolution and emergency-number formatting for the
 * Emergency Card (feature #111).
 *
 * Pure functions only — no I/O, no React. The card has to render from an
 * IndexedDB cache with the radio off, so everything here works from data already
 * on the device: the trip's stored country override, its location addresses, and
 * the bundled `countryFacts` snapshot.
 */

import {
  getCountryFacts,
  resolveCountryFromAddress,
  type CountryFacts,
  type EmergencyNumbers,
} from '../constants/countryFacts';

/** How the destination country was arrived at, so the UI can be honest about it. */
export type CountrySource = 'override' | 'location' | 'address' | 'unknown';

export interface ResolvedTripCountry {
  /** ISO 3166-1 alpha-2, or undefined when nothing resolved confidently. */
  code?: string;
  /** The bundled facts for `code`, or undefined when the code is outside the dataset. */
  facts?: CountryFacts;
  source: CountrySource;
}

/**
 * Works out which country's emergency numbers to print.
 *
 * Order is most-trustworthy-first:
 *
 * 1. The trip's explicit `Trip.countryCode` override.
 * 2. The first trip location with a structured `Location.countryCode`.
 * 3. The first trip location whose free-text address resolves confidently (rows with no code).
 * 4. Nothing — reported as `unknown` rather than guessed.
 *
 * A code that resolves but is outside the bundled dataset (say `TM`) still comes
 * back with its `source`, just with no `facts`; the caller shows "we don't have
 * numbers for this country" instead of pretending the country is unknown.
 *
 * @param overrideCode - The stored `Trip.countryCode`, if the traveller set one
 * @param addresses - Location addresses in trip order
 * @param locationCodes - Structured `Location.countryCode` values in trip order (absent in payloads cached before they existed)
 * @returns The resolved code, its facts, and how it was resolved
 *
 * @example
 * resolveTripCountry(null, ['Rua Augusta, Lisbon, Portugal']);
 * // -> { code: 'PT', facts: {...}, source: 'address' }
 */
export function resolveTripCountry(
  overrideCode: string | null | undefined,
  addresses: readonly string[] = [],
  locationCodes: readonly string[] = [],
): ResolvedTripCountry {
  const override = overrideCode?.trim().toUpperCase();
  if (override) {
    return { code: override, facts: getCountryFacts(override), source: 'override' };
  }

  for (const raw of locationCodes) {
    const code = raw?.trim().toUpperCase();
    if (code) {
      return { code, facts: getCountryFacts(code), source: 'location' };
    }
  }

  for (const address of addresses) {
    const code = resolveCountryFromAddress(address);
    if (code) {
      return { code, facts: getCountryFacts(code), source: 'address' };
    }
  }

  return { source: 'unknown' };
}

/** One emergency number, ready to render. */
export interface EmergencyNumberEntry {
  key: keyof EmergencyNumbers;
  label: string;
  number: string;
}

/** Display order: the number you dial first comes first. */
const EMERGENCY_NUMBER_LABELS: ReadonlyArray<{ key: keyof EmergencyNumbers; label: string }> = [
  { key: 'universal', label: 'All emergencies' },
  { key: 'ambulance', label: 'Ambulance' },
  { key: 'police', label: 'Police' },
  { key: 'fire', label: 'Fire' },
];

/**
 * Turns the bundled `emergency` record into a render-ready list.
 *
 * **An absent field is dropped, never rendered.** In `countryFacts.ts` a missing
 * `ambulance` means "not confidently known", not "this country has no ambulance
 * service" — printing "Ambulance: none" on a card someone reads during an
 * emergency would be actively dangerous. Anything not known simply does not
 * appear, and a country with nothing known yields an empty list, which the card
 * renders as an explicit "confirm locally" warning.
 *
 * @param emergency - The `facts.emergency` record, or undefined when no country resolved
 * @returns Only the numbers that are actually known, in dialling order
 */
export function listEmergencyNumbers(
  emergency: EmergencyNumbers | undefined,
): EmergencyNumberEntry[] {
  if (!emergency) return [];

  const entries: EmergencyNumberEntry[] = [];
  for (const { key, label } of EMERGENCY_NUMBER_LABELS) {
    const number = emergency[key];
    // Blank strings are treated as absent too — an empty label is no more useful
    // than a missing one, and the dataset is hand-maintained.
    if (typeof number === 'string' && number.trim().length > 0) {
      entries.push({ key, label, number: number.trim() });
    }
  }
  return entries;
}

/**
 * Strips a phone number down to what `tel:` accepts, keeping a leading `+`.
 * Returns null when nothing dialable remains, so the caller renders plain text
 * rather than a dead link.
 *
 * @param value - A human-entered phone number
 * @returns A `tel:` href, or null
 */
export function telHref(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  if (digits.replace(/\D/g, '').length === 0) return null;
  return `tel:${digits}`;
}
