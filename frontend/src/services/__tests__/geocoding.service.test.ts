import { describe, it, expect } from 'vitest';
import { countryCodeFromGeocode, type GeocodingResult } from '../geocoding.service';

const result = (address?: GeocodingResult['address']): GeocodingResult => ({
  place_id: 1,
  display_name: 'Somewhere',
  lat: '0',
  lon: '0',
  address,
});

describe('countryCodeFromGeocode', () => {
  it('upper-cases the geocoder country code', () => {
    expect(countryCodeFromGeocode(result({ country: 'France', country_code: 'fr' }))).toBe('FR');
  });

  it('returns undefined when the result has no usable code', () => {
    expect(countryCodeFromGeocode(result())).toBeUndefined();
    expect(countryCodeFromGeocode(result({ country: 'France' }))).toBeUndefined();
    expect(countryCodeFromGeocode(result({ country_code: 'fra' }))).toBeUndefined();
    expect(countryCodeFromGeocode(null)).toBeUndefined();
  });
});
