/**
 * Google Maps navigation links
 *
 * Test cases:
 * - GNAV-001: Android drives straight into navigation with google.navigation:, using the right mode
 * - GNAV-002: Android transit has no navigation scheme, so it uses the https directions link
 * - GNAV-003: iOS opens the Google Maps app, with the https link as the fallback
 * - GNAV-004: Desktop and unknown platforms get the https link for both
 * - GNAV-005: A place with only an address is searched by that text; coordinates win when present
 * - GNAV-006: Special characters are encoded, and a place with nothing to go on gives null
 * - GNAV-007: A starting point is ignored, because navigation starts from where the phone is
 */
import { describe, expect, it } from 'vitest';
import { buildGoogleNavigationLinks, type MapsPlace } from '../mapsDeepLinks';

const WITH_COORDS: MapsPlace = { name: 'Hotel Roma', address: 'Via X 1', latitude: 41.9028, longitude: 12.4964 };
const ADDRESS_ONLY: MapsPlace = { name: 'Hotel Roma', address: 'Via Nazionale 18, Roma' };

describe('buildGoogleNavigationLinks', () => {
  it('GNAV-001: Android drives straight into navigation, with the right mode', () => {
    const drive = buildGoogleNavigationLinks({ destination: WITH_COORDS, mode: 'driving', platform: 'android' });
    expect(drive?.primary).toBe('google.navigation:q=41.9028%2C12.4964&mode=d');
    expect(buildGoogleNavigationLinks({ destination: WITH_COORDS, mode: 'walking', platform: 'android' })?.primary).toBe(
      'google.navigation:q=41.9028%2C12.4964&mode=w'
    );
    expect(buildGoogleNavigationLinks({ destination: WITH_COORDS, mode: 'bicycling', platform: 'android' })?.primary).toBe(
      'google.navigation:q=41.9028%2C12.4964&mode=b'
    );
    // Driving is the default.
    expect(buildGoogleNavigationLinks({ destination: WITH_COORDS, platform: 'android' })?.primary).toContain('mode=d');
  });

  it('GNAV-002: Android transit has no navigation scheme, so it uses the https directions link', () => {
    const transit = buildGoogleNavigationLinks({ destination: WITH_COORDS, mode: 'transit', platform: 'android' });
    expect(transit?.primary).toBe(transit?.fallback);
    expect(transit?.primary).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=41.9028%2C12.4964&travelmode=transit'
    );
  });

  it('GNAV-003: iOS opens the Google Maps app, with the https link as the fallback', () => {
    const links = buildGoogleNavigationLinks({ destination: WITH_COORDS, mode: 'walking', platform: 'ios' });
    expect(links?.primary).toBe('comgooglemaps://?daddr=41.9028%2C12.4964&directionsmode=walking');
    expect(links?.fallback).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=41.9028%2C12.4964&travelmode=walking'
    );
  });

  it('GNAV-004: desktop and unspecified platforms get the https link for both', () => {
    for (const platform of ['desktop', undefined] as const) {
      const links = buildGoogleNavigationLinks({ destination: WITH_COORDS, mode: 'driving', platform });
      expect(links?.primary).toBe(links?.fallback);
      expect(links?.primary).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
    }
  });

  it('GNAV-005: an address-only place is searched by its text, and coordinates win when present', () => {
    const byAddress = buildGoogleNavigationLinks({ destination: ADDRESS_ONLY, mode: 'driving', platform: 'android' });
    // The name and address together make the search text.
    expect(byAddress?.primary).toBe(
      'google.navigation:q=' + encodeURIComponent('Via Nazionale 18, Roma') + '&mode=d'
    );

    // A place with both uses the coordinates, which cannot be misread.
    expect(buildGoogleNavigationLinks({ destination: WITH_COORDS, platform: 'android' })?.primary).toContain(
      '41.9028%2C12.4964'
    );
  });

  it('GNAV-006: encodes special characters, and gives null for an unusable place', () => {
    const tricky = buildGoogleNavigationLinks({
      destination: { address: 'Café & Bar, 5th St #2' },
      mode: 'walking',
      platform: 'android',
    });
    expect(tricky?.primary).toContain('Caf%C3%A9%20%26%20Bar');
    expect(tricky?.primary).not.toContain('&Bar');
    expect(tricky?.primary).toMatch(/&mode=w$/);

    expect(buildGoogleNavigationLinks({ destination: {} })).toBeNull();
    expect(buildGoogleNavigationLinks({ destination: { name: null, address: '  ' } })).toBeNull();
  });

  it('GNAV-007: ignores a starting point, since navigation starts from where the phone is', () => {
    const links = buildGoogleNavigationLinks({
      destination: WITH_COORDS,
      origin: { latitude: 48.8566, longitude: 2.3522 },
      mode: 'driving',
      platform: 'android',
    });
    expect(links?.primary).toBe('google.navigation:q=41.9028%2C12.4964&mode=d');
    expect(links?.fallback).not.toContain('origin=');
  });
});
