import { describe, it, expect } from 'vitest';
import {
  COUNTRY_FACTS,
  isCountryCodeFormat,
  listCountryNameEntries,
  listUnitedStatesStateNames,
  normalizeCountryCode,
  resolveCountryCodeFromName,
  resolveLocationCountryCode,
} from '../countryFacts';

describe('normalizeCountryCode', () => {
  it('upper-cases and trims well-formed codes, rejects the rest', () => {
    expect(normalizeCountryCode('fr')).toBe('FR');
    expect(normalizeCountryCode(' De ')).toBe('DE');
    expect(normalizeCountryCode('TM')).toBe('TM'); // valid even with no bundled facts
    expect(normalizeCountryCode('FRA')).toBeUndefined();
    expect(normalizeCountryCode('F1')).toBeUndefined();
    expect(normalizeCountryCode('')).toBeUndefined();
    expect(normalizeCountryCode(null)).toBeUndefined();
  });

  it('isCountryCodeFormat is strict about case', () => {
    expect(isCountryCodeFormat('FR')).toBe(true);
    expect(isCountryCodeFormat('fr')).toBe(false);
  });
});

describe('resolveCountryCodeFromName', () => {
  it('maps official names, aliases, visa-file aliases and bare codes', () => {
    expect(resolveCountryCodeFromName('France')).toBe('FR');
    expect(resolveCountryCodeFromName('  united STATES ')).toBe('US');
    expect(resolveCountryCodeFromName('USA')).toBe('US');
    expect(resolveCountryCodeFromName('America')).toBe('US');
    expect(resolveCountryCodeFromName('UK')).toBe('GB');
    expect(resolveCountryCodeFromName('Great Britain')).toBe('GB');
    expect(resolveCountryCodeFromName('Dubai')).toBe('AE');
    expect(resolveCountryCodeFromName('Deutschland')).toBe('DE');
    expect(resolveCountryCodeFromName('Österreich')).toBe('AT');
    expect(resolveCountryCodeFromName('DE')).toBe('DE');
  });

  it('returns undefined for unknown or empty names', () => {
    expect(resolveCountryCodeFromName('Atlantis')).toBeUndefined();
    expect(resolveCountryCodeFromName('')).toBeUndefined();
    expect(resolveCountryCodeFromName(null)).toBeUndefined();
    expect(resolveCountryCodeFromName('ZZ')).toBeUndefined();
  });

  it('whole-name-only aliases never leak into address parsing', () => {
    expect(resolveLocationCountryCode({ address: 'Lima, South America' })).toBeUndefined();
  });
});

describe('resolveLocationCountryCode', () => {
  it('prefers a well-formed code over the address', () => {
    expect(resolveLocationCountryCode({ countryCode: 'jp', address: 'Paris, France' })).toBe('JP');
    expect(resolveLocationCountryCode({ countryCode: 'nope', address: 'Paris, France' })).toBe('FR');
    expect(resolveLocationCountryCode({ address: null })).toBeUndefined();
  });
});

describe('name tables', () => {
  it('every name entry points at a country in the dataset', () => {
    for (const entry of listCountryNameEntries()) {
      expect(COUNTRY_FACTS[entry.code]).toBeDefined();
      expect(entry.name).toBe(entry.name.toLowerCase());
    }
  });

  it('lists US state names', () => {
    expect(listUnitedStatesStateNames()).toContain('new mexico');
  });
});
