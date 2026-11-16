import { describe, it, expect } from 'vitest';
import {
  matchLoyaltyPrograms,
  normalizeProviderName,
  airlineCodeFromFlightNumber,
  type MatchableProgram,
} from './loyaltyMatch';

const program = (overrides: Partial<MatchableProgram> & { id: number }): MatchableProgram => ({
  type: 'AIRLINE',
  providerName: 'Delta Air Lines',
  providerCode: null,
  alliance: null,
  aliases: [],
  ...overrides,
});

const delta = program({ id: 1, providerName: 'Delta Air Lines', providerCode: 'DL', alliance: 'SkyTeam' });
const united = program({ id: 2, providerName: 'United Airlines', providerCode: 'UA', alliance: 'Star Alliance' });
const hilton = program({ id: 3, type: 'HOTEL', providerName: 'Hilton Hotels & Resorts', aliases: ['Hilton Honors'] });
const hyatt = program({ id: 4, type: 'HOTEL', providerName: 'World of Hyatt', aliases: ['Hyatt', 'Grand Hyatt'] });
const amtrak = program({ id: 5, type: 'RAIL', providerName: 'Amtrak' });
const hertz = program({ id: 6, type: 'CAR_RENTAL', providerName: 'Hertz' });
const all = [delta, united, hilton, hyatt, amtrak, hertz];

const ids = (matches: { program: { id: number } }[]) => matches.map((m) => m.program.id);

describe('normalizeProviderName', () => {
  it('lower-cases, strips punctuation and accents, and drops decorative words', () => {
    expect(normalizeProviderName('Delta Air Lines')).toEqual(['delta']);
    expect(normalizeProviderName('  DELTA  ')).toEqual(['delta']);
    expect(normalizeProviderName('Hilton Hotels & Resorts')).toEqual(['hilton']);
    expect(normalizeProviderName('Air-France')).toEqual(['france']);
    expect(normalizeProviderName('Café Inn')).toEqual(['cafe']);
  });

  it('returns nothing for empty or all-decorative names', () => {
    expect(normalizeProviderName(null)).toEqual([]);
    expect(normalizeProviderName('')).toEqual([]);
    expect(normalizeProviderName('Hotel')).toEqual([]);
  });
});

describe('airlineCodeFromFlightNumber', () => {
  it('reads the leading IATA code', () => {
    expect(airlineCodeFromFlightNumber('DL123')).toBe('DL');
    expect(airlineCodeFromFlightNumber('dl 123')).toBe('DL');
    expect(airlineCodeFromFlightNumber('AZ-609')).toBe('AZ');
    expect(airlineCodeFromFlightNumber('9W 232')).toBe('9W');
    expect(airlineCodeFromFlightNumber('UA1234A')).toBe('UA');
  });

  it('returns null when it is not a flight number', () => {
    expect(airlineCodeFromFlightNumber('Eurostar 9014')).toBeNull();
    expect(airlineCodeFromFlightNumber('12345')).toBeNull();
    expect(airlineCodeFromFlightNumber('')).toBeNull();
    expect(airlineCodeFromFlightNumber(null)).toBeNull();
  });
});

describe('matchLoyaltyPrograms - transportation', () => {
  it('matches "Delta" to "Delta Air Lines" in either direction, ignoring case', () => {
    expect(ids(matchLoyaltyPrograms(all, { name: 'delta', transportType: 'flight' }, 'transportation'))).toEqual([1]);
    expect(
      ids(matchLoyaltyPrograms(all, { name: 'DELTA AIR LINES', transportType: 'flight' }, 'transportation'))
    ).toEqual([1]);
    expect(
      ids(matchLoyaltyPrograms([program({ id: 9, providerName: 'Delta' })], { name: 'Delta Air Lines' }, 'transportation'))
    ).toEqual([9]);
  });

  it('matches "United" to "United Airlines" but not to Delta', () => {
    expect(ids(matchLoyaltyPrograms(all, { name: 'United', transportType: 'flight' }, 'transportation'))).toEqual([2]);
  });

  it('matches by IATA code from the flight number when the carrier name is blank or odd', () => {
    const byNumber = matchLoyaltyPrograms(all, { name: '', vehicleNumber: 'DL 123', transportType: 'flight' }, 'transportation');
    expect(ids(byNumber)).toEqual([1]);
    expect(byNumber[0]).toMatchObject({ score: 100, reason: 'code' });

    expect(ids(matchLoyaltyPrograms(all, { name: 'Some Partner', code: 'ua', transportType: 'flight' }, 'transportation'))).toEqual([2]);
  });

  it('ranks a code match above a name match', () => {
    const twoDeltas = [program({ id: 10, providerName: 'Delta Air Lines' }), program({ id: 11, providerName: 'Other', providerCode: 'DL' })];
    const result = matchLoyaltyPrograms(twoDeltas, { name: 'Delta', vehicleNumber: 'DL9' }, 'transportation');
    expect(ids(result)).toEqual([11, 10]);
  });

  it('matches an alias and an alliance name', () => {
    const withAlias = program({ id: 12, providerName: 'Lufthansa', aliases: ['LH', 'Deutsche Lufthansa'] });
    expect(ids(matchLoyaltyPrograms([withAlias], { name: 'Deutsche Lufthansa AG' }, 'transportation'))).toEqual([12]);

    const result = matchLoyaltyPrograms(all, { name: 'Star Alliance', transportType: 'flight' }, 'transportation');
    expect(ids(result)).toEqual([2]);
    expect(result[0].reason).toBe('alliance');
  });

  it('only offers programs of a type that fits the leg', () => {
    const planeTrain = [program({ id: 20, providerName: 'Amtrak', type: 'AIRLINE' }), amtrak];
    expect(ids(matchLoyaltyPrograms(planeTrain, { name: 'Amtrak', transportType: 'train' }, 'transportation'))).toEqual([5]);
    expect(ids(matchLoyaltyPrograms(all, { name: 'Hertz', transportType: 'car' }, 'transportation'))).toEqual([6]);
    // Hotel programs never match a transport leg
    expect(ids(matchLoyaltyPrograms(all, { name: 'Hilton', transportType: 'flight' }, 'transportation'))).toEqual([]);
  });

  it('returns nothing for a blank carrier and no code, and for non-matches', () => {
    expect(matchLoyaltyPrograms(all, { name: '' }, 'transportation')).toEqual([]);
    expect(matchLoyaltyPrograms(all, { name: null }, 'transportation')).toEqual([]);
    expect(matchLoyaltyPrograms(all, { name: 'Southwest', transportType: 'flight' }, 'transportation')).toEqual([]);
  });

  it('does not confuse a hotel-only decorative query with everything', () => {
    expect(matchLoyaltyPrograms(all, { name: 'Air Lines' }, 'transportation')).toEqual([]);
  });
});

describe('matchLoyaltyPrograms - lodging', () => {
  it('matches a hotel name that contains the brand', () => {
    expect(ids(matchLoyaltyPrograms(all, { name: 'Hilton Garden Inn Boston Logan' }, 'lodging'))).toEqual([3]);
    expect(ids(matchLoyaltyPrograms(all, { name: 'Hilton' }, 'lodging'))).toEqual([3]);
  });

  it('matches through aliases', () => {
    expect(ids(matchLoyaltyPrograms(all, { name: 'Grand Hyatt Seattle' }, 'lodging'))).toEqual([4]);
    expect(ids(matchLoyaltyPrograms(all, { name: 'hyatt regency' }, 'lodging'))).toEqual([4]);
  });

  it('only offers hotel (or other) programs and ignores a flight number', () => {
    expect(matchLoyaltyPrograms(all, { name: 'Delta' }, 'lodging')).toEqual([]);
    expect(matchLoyaltyPrograms(all, { name: '', vehicleNumber: 'DL123' }, 'lodging')).toEqual([]);
  });

  it('does not match an unrelated hotel', () => {
    expect(matchLoyaltyPrograms(all, { name: 'Holiday Inn Express' }, 'lodging')).toEqual([]);
  });
});
