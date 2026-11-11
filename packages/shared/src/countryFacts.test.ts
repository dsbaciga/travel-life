import { describe, it, expect } from 'vitest';
import {
  COUNTRY_FACTS,
  getCountryFacts,
  resolveCountryFromAddress,
  type CountryFacts,
} from '../countryFacts';

const ALL: CountryFacts[] = Object.values(COUNTRY_FACTS);

describe('COUNTRY_FACTS', () => {
  it('covers a useful breadth of travelled countries', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(80);
  });

  it('keys the record by the entry own uppercase alpha-2 code', () => {
    for (const [key, facts] of Object.entries(COUNTRY_FACTS)) {
      expect(key).toMatch(/^[A-Z]{2}$/);
      expect(facts.code).toBe(key);
    }
  });

  it('gives every country a name and at least one emergency number', () => {
    for (const facts of ALL) {
      expect(facts.name.trim().length).toBeGreaterThan(0);
      const numbers = Object.values(facts.emergency).filter(Boolean);
      expect(numbers.length, `${facts.code} has no emergency numbers`).toBeGreaterThan(0);
    }
  });

  it('uses digit-only emergency numbers', () => {
    for (const facts of ALL) {
      for (const number of Object.values(facts.emergency)) {
        expect(number, `${facts.code}: ${number}`).toMatch(/^\d{2,5}$/);
      }
    }
  });

  it('gives every country plausible electricity data', () => {
    for (const facts of ALL) {
      expect(facts.electricity.plugTypes.length, facts.code).toBeGreaterThan(0);
      for (const plug of facts.electricity.plugTypes) {
        expect(plug, facts.code).toMatch(/^[A-O]$/);
      }
      expect(facts.electricity.voltage, facts.code).toBeGreaterThanOrEqual(100);
      expect(facts.electricity.voltage, facts.code).toBeLessThanOrEqual(240);
      expect([50, 60], facts.code).toContain(facts.electricity.frequency);
    }
  });

  it('gives every country a non-empty tipping sentence', () => {
    for (const facts of ALL) {
      expect(facts.tipping.trim().length, facts.code).toBeGreaterThan(10);
    }
  });

  it('uses only the documented tapWater and drivingSide values', () => {
    for (const facts of ALL) {
      expect(['safe', 'caution', 'unsafe'], facts.code).toContain(facts.tapWater);
      expect(['left', 'right'], facts.code).toContain(facts.drivingSide);
    }
  });

  it('records the emergency numbers travellers actually rely on', () => {
    expect(COUNTRY_FACTS.US.emergency.universal).toBe('911');
    expect(COUNTRY_FACTS.CA.emergency.universal).toBe('911');
    expect(COUNTRY_FACTS.GB.emergency.universal).toBe('999');
    expect(COUNTRY_FACTS.AU.emergency.universal).toBe('000');
    expect(COUNTRY_FACTS.NZ.emergency.universal).toBe('111');
    expect(COUNTRY_FACTS.JP.emergency.police).toBe('110');
    expect(COUNTRY_FACTS.JP.emergency.ambulance).toBe('119');
    expect(COUNTRY_FACTS.JP.emergency.universal).toBeUndefined();
    expect(COUNTRY_FACTS.KR.emergency.police).toBe('112');
    expect(COUNTRY_FACTS.KR.emergency.fire).toBe('119');
    expect(COUNTRY_FACTS.CN.emergency.ambulance).toBe('120');
    expect(COUNTRY_FACTS.SG.emergency.ambulance).toBe('995');
    expect(COUNTRY_FACTS.OM.emergency.universal).toBe('9999');
  });

  it('uses 112 across the European Union', () => {
    const euCodes = [
      'AT',
      'BE',
      'BG',
      'CY',
      'CZ',
      'DE',
      'DK',
      'EE',
      'ES',
      'FI',
      'FR',
      'GR',
      'HR',
      'HU',
      'IE',
      'IT',
      'LT',
      'LU',
      'LV',
      'MT',
      'NL',
      'PL',
      'PT',
      'RO',
      'SE',
      'SI',
      'SK',
    ];
    for (const code of euCodes) {
      expect(COUNTRY_FACTS[code], `${code} missing from dataset`).toBeDefined();
      expect(COUNTRY_FACTS[code].emergency.universal, code).toBe('112');
    }
  });

  it('marks the well-known left-hand-drive countries', () => {
    for (const code of ['GB', 'IE', 'AU', 'NZ', 'JP', 'ZA', 'IN', 'TH', 'SG', 'MT', 'CY']) {
      expect(COUNTRY_FACTS[code].drivingSide, code).toBe('left');
    }
    for (const code of ['US', 'CA', 'FR', 'DE', 'BR', 'KR', 'CN', 'AE']) {
      expect(COUNTRY_FACTS[code].drivingSide, code).toBe('right');
    }
  });

  it('records the mains supply travellers pack adapters for', () => {
    expect(COUNTRY_FACTS.GB.electricity.plugTypes).toEqual(['G']);
    expect(COUNTRY_FACTS.US.electricity).toEqual({
      plugTypes: ['A', 'B'],
      voltage: 120,
      frequency: 60,
    });
    expect(COUNTRY_FACTS.JP.electricity.voltage).toBe(100);
    expect(COUNTRY_FACTS.AU.electricity.plugTypes).toEqual(['I']);
    expect(COUNTRY_FACTS.CH.electricity.plugTypes).toContain('J');
    expect(COUNTRY_FACTS.IT.electricity.plugTypes).toContain('L');
  });

  it('covers every continent the app is likely to see', () => {
    for (const code of [
      'FR',
      'US',
      'MX',
      'BR',
      'JP',
      'TH',
      'IN',
      'AU',
      'AE',
      'EG',
      'ZA',
      'KE',
      'MA',
    ]) {
      expect(COUNTRY_FACTS[code], `${code} missing`).toBeDefined();
    }
  });
});

describe('getCountryFacts', () => {
  it('looks a country up by its alpha-2 code', () => {
    expect(getCountryFacts('FR')?.name).toBe('France');
  });

  it('is case-insensitive and tolerant of whitespace', () => {
    expect(getCountryFacts('fr')?.code).toBe('FR');
    expect(getCountryFacts('  Jp  ')?.code).toBe('JP');
  });

  it('returns undefined for unknown or empty codes', () => {
    expect(getCountryFacts('ZZ')).toBeUndefined();
    expect(getCountryFacts('')).toBeUndefined();
    expect(getCountryFacts(null)).toBeUndefined();
    expect(getCountryFacts(undefined)).toBeUndefined();
    expect(getCountryFacts('FRA')).toBeUndefined();
  });

  it('never hands back a mutable reference that can desync the record', () => {
    expect(getCountryFacts('FR')).toBe(COUNTRY_FACTS.FR);
  });
});

describe('resolveCountryFromAddress', () => {
  it('returns undefined for empty input', () => {
    expect(resolveCountryFromAddress(null)).toBeUndefined();
    expect(resolveCountryFromAddress(undefined)).toBeUndefined();
    expect(resolveCountryFromAddress('')).toBeUndefined();
    expect(resolveCountryFromAddress('   ')).toBeUndefined();
  });

  it('reads the country from the last comma-separated segment', () => {
    expect(resolveCountryFromAddress('10 Downing Street, London, United Kingdom')).toBe('GB');
    expect(resolveCountryFromAddress('Champ de Mars, 75007 Paris, France')).toBe('FR');
    expect(resolveCountryFromAddress('Piazza del Colosseo 1, Roma, Italy')).toBe('IT');
  });

  it('is case-insensitive and tolerant of whitespace and punctuation', () => {
    expect(resolveCountryFromAddress('Paris,   FRANCE  ')).toBe('FR');
    expect(resolveCountryFromAddress('Kyoto, japan')).toBe('JP');
    expect(resolveCountryFromAddress('New York, U.S.A.')).toBe('US');
    expect(resolveCountryFromAddress('London, U.K.')).toBe('GB');
  });

  it('handles common country aliases and long forms', () => {
    expect(resolveCountryFromAddress('Austin, USA')).toBe('US');
    expect(resolveCountryFromAddress('Boston, United States')).toBe('US');
    expect(resolveCountryFromAddress('Chicago, United States of America')).toBe('US');
    expect(resolveCountryFromAddress('Cardiff, Wales')).toBe('GB');
    expect(resolveCountryFromAddress('Edinburgh, Scotland')).toBe('GB');
    expect(resolveCountryFromAddress('Belfast, Northern Ireland')).toBe('GB');
    expect(resolveCountryFromAddress('Manchester, England')).toBe('GB');
    expect(resolveCountryFromAddress('Amsterdam, Holland')).toBe('NL');
    expect(resolveCountryFromAddress('Seoul, South Korea')).toBe('KR');
    expect(resolveCountryFromAddress('Busan, Korea, Republic of')).toBe('KR');
    expect(resolveCountryFromAddress('Prague, Czechia')).toBe('CZ');
    expect(resolveCountryFromAddress('Brno, Czech Republic')).toBe('CZ');
    expect(resolveCountryFromAddress('Dubai, UAE')).toBe('AE');
    expect(resolveCountryFromAddress('Abu Dhabi, United Arab Emirates')).toBe('AE');
  });

  it('accepts endonyms and accented spellings', () => {
    expect(resolveCountryFromAddress('Wien, Österreich')).toBe('AT');
    expect(resolveCountryFromAddress('Berlin, Deutschland')).toBe('DE');
    expect(resolveCountryFromAddress('São Paulo, Brasil')).toBe('BR');
    expect(resolveCountryFromAddress('Ciudad de México, México')).toBe('MX');
    expect(resolveCountryFromAddress('Istanbul, Türkiye')).toBe('TR');
  });

  it('still finds the country when a postcode trails it', () => {
    expect(resolveCountryFromAddress('Shibuya, Tokyo, Japan 150-0002')).toBe('JP');
    expect(resolveCountryFromAddress('Barcelona, Spain 08001')).toBe('ES');
  });

  it('resolves an address that is only a country name', () => {
    expect(resolveCountryFromAddress('Japan')).toBe('JP');
    expect(resolveCountryFromAddress('  new zealand ')).toBe('NZ');
  });

  /* --------------------------------------------------------------- */
  /* False-positive traps                                             */
  /* --------------------------------------------------------------- */

  it('never lets a neighbourhood name outrank the real country', () => {
    // The headline trap: "Chinatown" must never resolve to China.
    expect(resolveCountryFromAddress('Chinatown, San Francisco, USA')).toBe('US');
    expect(resolveCountryFromAddress('Chinatown, Manhattan, New York, USA')).toBe('US');
    expect(resolveCountryFromAddress('Little India, Singapore')).toBe('SG');
    expect(resolveCountryFromAddress('Little Italy, New York, United States')).toBe('US');
    expect(resolveCountryFromAddress('Koreatown, Los Angeles, USA')).toBe('US');
    expect(resolveCountryFromAddress('Japantown, San Jose, United States')).toBe('US');
  });

  it('does not match a country name buried inside a longer word', () => {
    expect(resolveCountryFromAddress('Chinatown, San Francisco')).toBeUndefined();
    expect(resolveCountryFromAddress('Indianapolis Motor Speedway')).toBeUndefined();
    expect(resolveCountryFromAddress('Koreatown')).toBeUndefined();
  });

  it('does not match a country name used as a street or landmark name', () => {
    expect(resolveCountryFromAddress('123 Little India Arcade, Serangoon Road')).toBeUndefined();
    expect(resolveCountryFromAddress('Turkey Creek, Tennessee')).toBe('US');
    expect(resolveCountryFromAddress('Turkey Creek Park')).toBeUndefined();
    expect(resolveCountryFromAddress('Cuba Street')).toBeUndefined();
    expect(resolveCountryFromAddress('Jordan Road')).toBeUndefined();
    expect(resolveCountryFromAddress('India Gate, New Delhi, India')).toBe('IN');
  });

  it('treats "New Mexico" as the US state, not Mexico', () => {
    expect(resolveCountryFromAddress('Santa Fe, New Mexico, United States')).toBe('US');
    expect(resolveCountryFromAddress('Santa Fe, New Mexico')).toBe('US');
    expect(resolveCountryFromAddress('Santa Fe, New Mexico 87501')).toBe('US');
    // ...while the country itself still resolves.
    expect(resolveCountryFromAddress('Oaxaca, Mexico')).toBe('MX');
    expect(resolveCountryFromAddress('Mexico City, Mexico')).toBe('MX');
  });

  it('disambiguates Georgia the US state from Georgia the country', () => {
    // An explicit country marker always wins.
    expect(resolveCountryFromAddress('Atlanta, Georgia, USA')).toBe('US');
    expect(resolveCountryFromAddress('Savannah, Georgia, United States')).toBe('US');
    // So does any other US signal in the address.
    expect(resolveCountryFromAddress('Atlanta, Fulton County, Georgia')).toBe('US');
    expect(resolveCountryFromAddress('Savannah, Georgia 31401')).toBe('US');
    expect(resolveCountryFromAddress('Georgia, Vermont')).toBe('US');
    expect(resolveCountryFromAddress('Atlanta, Georgia, 30303')).toBe('US');
    // With nothing pointing at the US, a trailing "Georgia" is the country.
    expect(resolveCountryFromAddress('Tbilisi, Georgia')).toBe('GE');
    expect(resolveCountryFromAddress('Rustaveli Avenue, Tbilisi, Georgia')).toBe('GE');
    // A four-digit Georgian postcode after the country name is not a US ZIP.
    expect(resolveCountryFromAddress('Tbilisi, Georgia, 0105')).toBe('GE');
  });

  it('reads other US states as the United States', () => {
    expect(resolveCountryFromAddress('Austin, Texas')).toBe('US');
    expect(resolveCountryFromAddress('Lebanon, New Hampshire')).toBe('US');
    expect(resolveCountryFromAddress('Paris, Texas')).toBe('US');
    expect(resolveCountryFromAddress('Panama City, Florida')).toBe('US');
    expect(resolveCountryFromAddress('1600 Pennsylvania Avenue NW, Washington, DC 20500')).toBe(
      'US',
    );
  });

  it('does not mistake an Irish or British county for a US county address', () => {
    expect(resolveCountryFromAddress('Ballyvaughan, County Clare, Ireland')).toBe('IE');
    expect(resolveCountryFromAddress('Kinsale, County Cork, Ireland')).toBe('IE');
  });

  it('never resolves a bare two-letter code, which would collide with US states', () => {
    // "GA" is Gabon, "IN" is India, "CA" is Canada — none of these are countries here.
    expect(resolveCountryFromAddress('Atlanta, GA 30303')).toBeUndefined();
    expect(resolveCountryFromAddress('Indianapolis, IN 46204')).toBeUndefined();
    expect(resolveCountryFromAddress('Los Angeles, CA 90049')).toBeUndefined();
  });

  it('returns undefined instead of guessing when no country is present', () => {
    expect(resolveCountryFromAddress('42 Elm Street')).toBeUndefined();
    expect(resolveCountryFromAddress('Somewhere over the rainbow')).toBeUndefined();
    expect(resolveCountryFromAddress('12345')).toBeUndefined();
  });

  it('always returns a code that exists in the dataset', () => {
    const addresses = [
      'Chinatown, San Francisco, USA',
      'Tbilisi, Georgia',
      'Seoul, South Korea',
      'Amsterdam, Holland',
      'Kinsale, County Cork, Ireland',
      'Shibuya, Tokyo, Japan 150-0002',
      'Cardiff, Wales',
    ];
    for (const address of addresses) {
      const code = resolveCountryFromAddress(address);
      expect(code, address).toBeDefined();
      expect(getCountryFacts(code), address).toBeDefined();
    }
  });
});
