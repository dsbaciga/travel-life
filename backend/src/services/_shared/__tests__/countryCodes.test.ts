/**
 * Country code helpers (data model reorganization, Step B).
 *
 * - CC-001: A supplied code wins, normalised to upper case
 * - CC-002: Otherwise the code is derived from the address / name
 * - CC-003: Update rules never leave a stale code behind
 * - CC-004: The SQL backfill in migration 20261121000000 is generated from, and matches, the shared table
 */
import fs from 'fs';
import path from 'path';
import {
  deriveCountryCodeFromName,
  deriveLocationCountryCode,
  resolveLocationCountryCodeUpdate,
} from '../countryCodes';
import { listCountryNameEntries, listUnitedStatesStateNames } from '../vendored/countryFacts';

describe('deriveLocationCountryCode', () => {
  it('CC-001: a well-formed supplied code wins and is upper-cased', () => {
    expect(deriveLocationCountryCode('fr', 'Tokyo, Japan')).toBe('FR');
    expect(deriveLocationCountryCode(' de ', null)).toBe('DE');
  });

  it('CC-002: a malformed code is ignored in favour of the address', () => {
    expect(deriveLocationCountryCode('France', 'Tokyo, Japan')).toBe('JP');
    expect(deriveLocationCountryCode('', 'Tokyo, Japan')).toBe('JP');
  });

  it('CC-002: derives from address endings, aliases, postcodes and case', () => {
    expect(deriveLocationCountryCode(null, '12 Rue de Rivoli, Paris, France')).toBe('FR');
    expect(deriveLocationCountryCode(null, '1600 Pennsylvania Ave NW, Washington, USA')).toBe('US');
    expect(deriveLocationCountryCode(null, '5th Ave, New York, United States')).toBe('US');
    expect(deriveLocationCountryCode(null, '10 Downing St, London, UK')).toBe('GB');
    expect(deriveLocationCountryCode(null, 'Rue de Rivoli, Paris, France 75001')).toBe('FR');
    expect(deriveLocationCountryCode(null, 'shibuya, tokyo, japan')).toBe('JP');
    expect(deriveLocationCountryCode(null, 'Calle Mayor 1, Madrid, sPaIn')).toBe('ES');
    expect(deriveLocationCountryCode(null, 'London, United Kingdom SW1A 1AA')).toBe('GB');
    // Two-letter aliases are never matched inside a segment (too many false positives).
    expect(deriveLocationCountryCode(null, 'London, UK SW1A 1AA')).toBeNull();
  });

  it('CC-002: no country in the address, or no address, gives null', () => {
    expect(deriveLocationCountryCode(null, '221B Baker Street')).toBeNull();
    expect(deriveLocationCountryCode(null, null)).toBeNull();
    expect(deriveLocationCountryCode(undefined, '')).toBeNull();
  });

  it('CC-002: a US place name does not resolve to a similarly named country', () => {
    expect(deriveLocationCountryCode(null, 'Plaza, Santa Fe, New Mexico')).toBe('US');
    expect(deriveLocationCountryCode(null, 'Chinatown, San Francisco, USA')).toBe('US');
  });
});

describe('deriveCountryCodeFromName', () => {
  it('CC-001/002: supplied code, else the whole name, else null', () => {
    expect(deriveCountryCodeFromName('gb', 'United States')).toBe('GB');
    expect(deriveCountryCodeFromName(null, 'United States')).toBe('US');
    expect(deriveCountryCodeFromName(undefined, 'usa')).toBe('US');
    expect(deriveCountryCodeFromName(null, 'UK')).toBe('GB');
    expect(deriveCountryCodeFromName(null, 'Deutschland')).toBe('DE');
    expect(deriveCountryCodeFromName(null, 'DE')).toBe('DE');
    expect(deriveCountryCodeFromName(null, '  FRANCE ')).toBe('FR');
    expect(deriveCountryCodeFromName(null, 'Atlantis')).toBeNull();
  });
});

describe('resolveLocationCountryCodeUpdate', () => {
  it('CC-003: nothing about the country in the request leaves the stored code', () => {
    expect(resolveLocationCountryCodeUpdate({}, 'Paris, France')).toBeUndefined();
  });

  it('CC-003: re-sending the same address leaves the stored code (it may be from the geocoder)', () => {
    expect(resolveLocationCountryCodeUpdate({ address: 'Paris, France' }, 'Paris, France')).toBeUndefined();
  });

  it('CC-003: a different address re-derives, to null when it names no country', () => {
    expect(resolveLocationCountryCodeUpdate({ address: 'Rome, Italy' }, 'Paris, France')).toBe('IT');
    expect(resolveLocationCountryCodeUpdate({ address: 'Baker Street' }, 'Paris, France')).toBeNull();
    expect(resolveLocationCountryCodeUpdate({ address: null }, 'Paris, France')).toBeNull();
  });

  it('CC-003: a supplied code wins; an explicit null re-derives from the effective address', () => {
    expect(resolveLocationCountryCodeUpdate({ address: 'Rome, Italy', countryCode: 'sm' }, 'Paris, France')).toBe('SM');
    expect(resolveLocationCountryCodeUpdate({ countryCode: null }, 'Paris, France')).toBe('FR');
    expect(resolveLocationCountryCodeUpdate({ countryCode: null, address: 'Rome, Italy' }, 'Paris, France')).toBe('IT');
    expect(resolveLocationCountryCodeUpdate({ countryCode: null }, null)).toBeNull();
  });
});

describe('migration 20261121000000_add_structured_country_codes', () => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, '../../../../prisma/migrations/20261121000000_add_structured_country_codes/migration.sql'),
    'utf8'
  );
  const rows = [...sql.matchAll(/^\s*\('([^']*)', '([A-Z]{2})', '(country|whole|us_state|ambiguous)'\)/gm)].map((m) => ({
    name: m[1],
    code: m[2],
    kind: m[3],
  }));

  it('CC-004: every shared name/alias is in the migration table with the same code', () => {
    const byName = new Map(rows.map((r) => [r.name, r]));
    for (const entry of listCountryNameEntries()) {
      if (entry.name === 'georgia') {
        expect(byName.get('georgia')).toMatchObject({ code: 'GE', kind: 'ambiguous' });
        continue;
      }
      expect(byName.get(entry.name)).toMatchObject({
        code: entry.code,
        kind: entry.wholeNameOnly ? 'whole' : 'country',
      });
    }
  });

  it('CC-004: the migration table holds nothing the shared table does not', () => {
    const known = new Set(listCountryNameEntries().map((e) => e.name));
    const states = new Set(listUnitedStatesStateNames());
    for (const row of rows) {
      if (row.kind === 'us_state') {
        expect(states.has(row.name)).toBe(true);
        expect(row.code).toBe('US');
      } else {
        expect(known.has(row.name)).toBe(true);
      }
    }
    for (const state of states) {
      if (!known.has(state)) expect(rows.some((r) => r.name === state && r.kind === 'us_state')).toBe(true);
    }
  });

  it('CC-004: asserts the format invariant instead of demanding every row be mapped', () => {
    expect(sql).toContain('RAISE EXCEPTION');
    expect(sql).toContain("!~ '^[A-Z]{2}$'");
  });
});
