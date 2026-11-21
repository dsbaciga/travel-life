/**
 * Structured country codes (ISO 3166-1 alpha-2) for locations, travel documents and the visa
 * check. The name/alias tables live in packages/shared (`countryFacts.ts`, vendored into
 * `vendored/`); this file only adds the persistence rules the services share.
 *
 * Rule of thumb everywhere: a code the client supplied wins; otherwise derive it from the
 * text; otherwise null. A derived value never outlives a change to the text it came from.
 */
import {
  normalizeCountryCode,
  resolveCountryCodeFromName,
  resolveCountryFromAddress,
} from './vendored/countryFacts';

/** Country for a location: the supplied code if well formed, else the address text, else null. */
export function deriveLocationCountryCode(
  countryCode: string | null | undefined,
  address: string | null | undefined
): string | null {
  return normalizeCountryCode(countryCode) ?? resolveCountryFromAddress(address) ?? null;
}

/** Country for a country-name field (passport issuer, visa row): supplied code, else name, else null. */
export function deriveCountryCodeFromName(
  countryCode: string | null | undefined,
  name: string | null | undefined
): string | null {
  return normalizeCountryCode(countryCode) ?? resolveCountryCodeFromName(name) ?? null;
}

/**
 * The `countryCode` to write when a location's fields change, or `undefined` to leave the
 * stored value alone.
 *
 * - A code in the request is stored as given.
 * - An explicit null clears it and re-derives from the (new or existing) address.
 * - An address change with no code in the request re-derives from the new address, so a code
 *   taken from the old address can never contradict the new one. Re-sending the unchanged
 *   address keeps whatever code is stored (it may have come from the geocoder, which is
 *   better than text parsing).
 */
export function resolveLocationCountryCodeUpdate(
  data: { countryCode?: string | null; address?: string | null },
  existingAddress: string | null
): string | null | undefined {
  const nextAddress = data.address !== undefined ? data.address : existingAddress;
  if (data.countryCode !== undefined) {
    return deriveLocationCountryCode(data.countryCode, nextAddress);
  }
  if (data.address !== undefined && (data.address ?? null) !== existingAddress) {
    return deriveLocationCountryCode(null, data.address);
  }
  return undefined;
}
