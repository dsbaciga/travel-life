import { describe, it, expect } from 'vitest';
import {
  MAPS_APPS,
  MAPS_APP_LABELS,
  buildAppleMapsUrl,
  buildCitymapperUrl,
  buildDirectionsUrl,
  buildGoogleMapsUrl,
  buildLyftUrl,
  buildMapsAppLinks,
  buildUberUrl,
  describeRoute,
  detectMapsPlatform,
  hasUsableLocation,
  isMapsApp,
  isMapsPlatform,
  isTravelMode,
  pickPreviousPlace,
  resolvePlace,
  type MapsPlace,
  type MapsPlatform,
} from '../mapsDeepLinks';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const HOTEL: MapsPlace = {
  name: 'Hotel Danieli',
  address: 'Riva degli Schiavoni, 4196, 30122 Venezia VE, Italy',
  latitude: 45.433611,
  longitude: 12.34075,
};

const RESTAURANT: MapsPlace = {
  name: 'Osteria alle Testiere',
  address: 'Calle del Mondo Novo, 5801, 30122 Venezia VE, Italy',
  latitude: 45.436,
  longitude: 12.3405,
};

/** Address only — no coordinates. */
const ADDRESS_ONLY: MapsPlace = {
  name: null,
  address: 'Kärntner Straße 1, 1010 Wien, Österreich',
  latitude: null,
  longitude: null,
};

/** Name only — the last-resort fallback. */
const NAME_ONLY: MapsPlace = { name: 'Gare du Nord' };

/** Nothing usable at all. */
const EMPTY: MapsPlace = { name: '  ', address: '', latitude: null, longitude: null };

/** Deliberately nasty text: comma, ampersand, space, non-ASCII, plus, hash. */
const NASTY: MapsPlace = {
  name: 'Café & Bar "Zoë"',
  address: '1 Straße & Co, Süd #3 + Ost, 東京都',
};

/**
 * Read a single query parameter back out of a built URL, decoded.
 * Deliberately does not use `new URL`, so custom schemes work too.
 */
function param(url: string, key: string): string | null {
  const query = url.slice(url.indexOf('?') + 1);
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if (pair.slice(0, eq) === key) {
      return decodeURIComponent(pair.slice(eq + 1));
    }
  }
  return null;
}

const PLATFORMS: MapsPlatform[] = ['ios', 'android', 'desktop'];

/* ------------------------------------------------------------------ */
/* Type guards                                                         */
/* ------------------------------------------------------------------ */

describe('type guards', () => {
  it('isMapsApp accepts every known app and rejects everything else', () => {
    for (const app of MAPS_APPS) {
      expect(isMapsApp(app)).toBe(true);
    }
    expect(isMapsApp('waze')).toBe(false);
    expect(isMapsApp('')).toBe(false);
    expect(isMapsApp(null)).toBe(false);
    expect(isMapsApp(undefined)).toBe(false);
    expect(isMapsApp(42)).toBe(false);
    expect(isMapsApp({ app: 'google' })).toBe(false);
  });

  it('isTravelMode and isMapsPlatform narrow correctly', () => {
    expect(isTravelMode('driving')).toBe(true);
    expect(isTravelMode('bicycling')).toBe(true);
    expect(isTravelMode('teleport')).toBe(false);
    expect(isMapsPlatform('ios')).toBe(true);
    expect(isMapsPlatform('windows')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* resolvePlace — the coords -> address -> name ladder                  */
/* ------------------------------------------------------------------ */

describe('resolvePlace', () => {
  it('prefers coordinates and labels them with the name', () => {
    expect(resolvePlace(HOTEL)).toEqual({
      kind: 'coords',
      latitude: 45.433611,
      longitude: 12.34075,
      label: 'Hotel Danieli',
    });
  });

  it('labels coordinates with the address when there is no name', () => {
    const resolved = resolvePlace({ address: '10 Downing St', latitude: 51.5, longitude: -0.12 });
    expect(resolved).toEqual({
      kind: 'coords',
      latitude: 51.5,
      longitude: -0.12,
      label: '10 Downing St',
    });
  });

  it('leaves the label null when coordinates carry no text', () => {
    expect(resolvePlace({ latitude: 1, longitude: 2 })).toEqual({
      kind: 'coords',
      latitude: 1,
      longitude: 2,
      label: null,
    });
  });

  it('falls back to the address when coordinates are missing', () => {
    expect(resolvePlace(ADDRESS_ONLY)).toEqual({
      kind: 'query',
      query: 'Kärntner Straße 1, 1010 Wien, Österreich',
    });
  });

  it('falls back to the name when there is neither coordinates nor address', () => {
    expect(resolvePlace(NAME_ONLY)).toEqual({ kind: 'query', query: 'Gare du Nord' });
  });

  it('prefers the address over the name when both are present but coords are not', () => {
    expect(resolvePlace({ name: 'Home', address: '5 Elm St' })).toEqual({
      kind: 'query',
      query: '5 Elm St',
    });
  });

  it('trims whitespace and treats blank strings as absent', () => {
    expect(resolvePlace({ name: '  Louvre  ' })).toEqual({ kind: 'query', query: 'Louvre' });
    expect(resolvePlace({ name: 'Louvre', address: '   ' })).toEqual({
      kind: 'query',
      query: 'Louvre',
    });
    expect(resolvePlace(EMPTY)).toBeNull();
  });

  it('returns null for null and undefined places', () => {
    expect(resolvePlace(null)).toBeNull();
    expect(resolvePlace(undefined)).toBeNull();
  });

  it('rejects out-of-range and non-finite coordinates, falling through to text', () => {
    const outOfRange: MapsPlace[] = [
      { name: 'A', address: '1 St', latitude: 91, longitude: 0 },
      { name: 'A', address: '1 St', latitude: -91, longitude: 0 },
      { name: 'A', address: '1 St', latitude: 0, longitude: 181 },
      { name: 'A', address: '1 St', latitude: 0, longitude: -181 },
      { name: 'A', address: '1 St', latitude: Number.NaN, longitude: 0 },
      { name: 'A', address: '1 St', latitude: Number.POSITIVE_INFINITY, longitude: 0 },
    ];
    for (const place of outOfRange) {
      expect(resolvePlace(place)).toEqual({ kind: 'query', query: '1 St' });
    }
  });

  it('requires BOTH coordinates — a lone latitude is not a position', () => {
    expect(resolvePlace({ address: '1 St', latitude: 45 })).toEqual({
      kind: 'query',
      query: '1 St',
    });
    expect(resolvePlace({ address: '1 St', longitude: 12 })).toEqual({
      kind: 'query',
      query: '1 St',
    });
  });

  it('accepts the extremes of the valid ranges, including zero', () => {
    expect(resolvePlace({ latitude: 0, longitude: 0 })?.kind).toBe('coords');
    expect(resolvePlace({ latitude: 90, longitude: 180 })?.kind).toBe('coords');
    expect(resolvePlace({ latitude: -90, longitude: -180 })?.kind).toBe('coords');
  });
});

describe('hasUsableLocation', () => {
  it('mirrors resolvePlace', () => {
    expect(hasUsableLocation(HOTEL)).toBe(true);
    expect(hasUsableLocation(NAME_ONLY)).toBe(true);
    expect(hasUsableLocation(EMPTY)).toBe(false);
    expect(hasUsableLocation(null)).toBe(false);
    expect(hasUsableLocation(undefined)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* pickPreviousPlace — origin inferred from the previous itinerary item */
/* ------------------------------------------------------------------ */

describe('pickPreviousPlace', () => {
  it('returns the immediately preceding place', () => {
    expect(pickPreviousPlace([HOTEL, RESTAURANT], 1)).toBe(HOTEL);
  });

  it('skips over items with no usable location', () => {
    expect(pickPreviousPlace([HOTEL, EMPTY, null, undefined, RESTAURANT], 4)).toBe(HOTEL);
  });

  it('returns null for the first item of the day', () => {
    expect(pickPreviousPlace([HOTEL, RESTAURANT], 0)).toBeNull();
  });

  it('returns null when nothing before the index is usable', () => {
    expect(pickPreviousPlace([EMPTY, null, RESTAURANT], 2)).toBeNull();
  });

  it('handles an empty list and out-of-range indices', () => {
    expect(pickPreviousPlace([], 0)).toBeNull();
    expect(pickPreviousPlace([], 5)).toBeNull();
    expect(pickPreviousPlace([HOTEL], 99)).toBe(HOTEL);
    expect(pickPreviousPlace([HOTEL], -1)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Apple Maps                                                          */
/* ------------------------------------------------------------------ */

describe('buildAppleMapsUrl', () => {
  it('uses the maps:// scheme on iOS and https elsewhere', () => {
    expect(buildAppleMapsUrl({ destination: HOTEL, platform: 'ios' })).toMatch(/^maps:\/\/\?/);
    expect(buildAppleMapsUrl({ destination: HOTEL, platform: 'android' })).toMatch(
      /^https:\/\/maps\.apple\.com\/\?/
    );
    expect(buildAppleMapsUrl({ destination: HOTEL, platform: 'desktop' })).toMatch(
      /^https:\/\/maps\.apple\.com\/\?/
    );
  });

  it('defaults to the desktop https URL when no platform is given', () => {
    expect(buildAppleMapsUrl({ destination: HOTEL })).toMatch(/^https:\/\/maps\.apple\.com\//);
  });

  it('pre-fills origin and destination as coordinates', () => {
    const url = buildAppleMapsUrl({ origin: HOTEL, destination: RESTAURANT, platform: 'ios' });
    expect(url).not.toBeNull();
    expect(param(url ?? '', 'saddr')).toBe('45.433611,12.34075');
    expect(param(url ?? '', 'daddr')).toBe('45.436,12.3405');
  });

  it('omits saddr entirely when there is no origin', () => {
    const url = buildAppleMapsUrl({ destination: HOTEL }) ?? '';
    expect(url).not.toContain('saddr');
    expect(param(url, 'daddr')).toBe('45.433611,12.34075');
  });

  it('maps travel modes onto dirflg, folding cycling into walking', () => {
    const flag = (mode: 'driving' | 'walking' | 'bicycling' | 'transit') =>
      param(buildAppleMapsUrl({ destination: HOTEL, mode }) ?? '', 'dirflg');
    expect(flag('driving')).toBe('d');
    expect(flag('walking')).toBe('w');
    expect(flag('bicycling')).toBe('w');
    expect(flag('transit')).toBe('r');
    // driving is the default
    expect(param(buildAppleMapsUrl({ destination: HOTEL }) ?? '', 'dirflg')).toBe('d');
  });

  it('falls back to the address string when there are no coordinates', () => {
    const url = buildAppleMapsUrl({ destination: ADDRESS_ONLY }) ?? '';
    expect(param(url, 'daddr')).toBe('Kärntner Straße 1, 1010 Wien, Österreich');
  });

  it('falls back to the name when there is no address either', () => {
    expect(param(buildAppleMapsUrl({ destination: NAME_ONLY }) ?? '', 'daddr')).toBe(
      'Gare du Nord'
    );
  });

  it('returns null when the destination has nothing usable', () => {
    expect(buildAppleMapsUrl({ destination: EMPTY })).toBeNull();
  });

  it('ignores an unusable origin rather than failing', () => {
    const url = buildAppleMapsUrl({ destination: HOTEL, origin: EMPTY }) ?? '';
    expect(url).not.toContain('saddr');
  });
});

/* ------------------------------------------------------------------ */
/* Google Maps                                                         */
/* ------------------------------------------------------------------ */

describe('buildGoogleMapsUrl', () => {
  it('builds the universal dir URL on desktop', () => {
    const url = buildGoogleMapsUrl({ origin: HOTEL, destination: RESTAURANT }) ?? '';
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?/);
    expect(param(url, 'api')).toBe('1');
    expect(param(url, 'origin')).toBe('45.433611,12.34075');
    expect(param(url, 'destination')).toBe('45.436,12.3405');
    expect(param(url, 'travelmode')).toBe('driving');
  });

  it('passes each travel mode straight through', () => {
    for (const mode of ['driving', 'walking', 'bicycling', 'transit'] as const) {
      expect(param(buildGoogleMapsUrl({ destination: HOTEL, mode }) ?? '', 'travelmode')).toBe(
        mode
      );
    }
  });

  it('uses a geo: URI on Android when there is no origin', () => {
    const url = buildGoogleMapsUrl({ destination: HOTEL, platform: 'android' }) ?? '';
    expect(url.startsWith('geo:45.433611,12.34075?q=')).toBe(true);
    expect(param(url, 'q')).toBe('45.433611,12.34075(Hotel Danieli)');
  });

  it('geo: falls back to 0,0 with a text query when there are no coordinates', () => {
    const url = buildGoogleMapsUrl({ destination: ADDRESS_ONLY, platform: 'android' }) ?? '';
    expect(url.startsWith('geo:0,0?q=')).toBe(true);
    expect(param(url, 'q')).toBe('Kärntner Straße 1, 1010 Wien, Österreich');
  });

  it('geo: drops the parenthesised label when the place is unnamed', () => {
    const url = buildGoogleMapsUrl({
      destination: { latitude: 1.5, longitude: 2.5 },
      platform: 'android',
    }) ?? '';
    expect(param(url, 'q')).toBe('1.5,2.5');
  });

  it('uses the https dir URL on Android once an origin exists (geo: cannot route)', () => {
    const url = buildGoogleMapsUrl({
      origin: HOTEL,
      destination: RESTAURANT,
      platform: 'android',
    }) ?? '';
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\//);
    expect(param(url, 'origin')).toBe('45.433611,12.34075');
  });

  it('uses the https dir URL on iOS', () => {
    const url = buildGoogleMapsUrl({ destination: HOTEL, platform: 'ios' }) ?? '';
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\//);
  });

  it('returns null without a usable destination', () => {
    expect(buildGoogleMapsUrl({ destination: EMPTY })).toBeNull();
    expect(buildGoogleMapsUrl({ destination: EMPTY, platform: 'android' })).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Citymapper                                                          */
/* ------------------------------------------------------------------ */

describe('buildCitymapperUrl', () => {
  it('uses the native scheme on mobile and https on desktop', () => {
    expect(buildCitymapperUrl({ destination: HOTEL, platform: 'ios' })).toMatch(
      /^citymapper:\/\/directions\?/
    );
    expect(buildCitymapperUrl({ destination: HOTEL, platform: 'android' })).toMatch(
      /^citymapper:\/\/directions\?/
    );
    expect(buildCitymapperUrl({ destination: HOTEL, platform: 'desktop' })).toMatch(
      /^https:\/\/citymapper\.com\/directions\?/
    );
  });

  it('sends both endpoints with their names', () => {
    const url = buildCitymapperUrl({ origin: HOTEL, destination: RESTAURANT }) ?? '';
    expect(param(url, 'startcoord')).toBe('45.433611,12.34075');
    expect(param(url, 'startname')).toBe('Hotel Danieli');
    expect(param(url, 'endcoord')).toBe('45.436,12.3405');
    expect(param(url, 'endname')).toBe('Osteria alle Testiere');
  });

  it('omits the start entirely when the origin has no coordinates', () => {
    const url = buildCitymapperUrl({ origin: ADDRESS_ONLY, destination: HOTEL }) ?? '';
    expect(url).not.toContain('startcoord');
    expect(url).not.toContain('startname');
    expect(param(url, 'endcoord')).toBe('45.433611,12.34075');
  });

  it('returns null without destination coordinates — a name alone is useless to it', () => {
    expect(buildCitymapperUrl({ destination: ADDRESS_ONLY })).toBeNull();
    expect(buildCitymapperUrl({ destination: NAME_ONLY })).toBeNull();
    expect(buildCitymapperUrl({ destination: EMPTY })).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Uber                                                                */
/* ------------------------------------------------------------------ */

describe('buildUberUrl', () => {
  it('uses the native scheme on mobile and m.uber.com on desktop', () => {
    expect(buildUberUrl({ destination: HOTEL, platform: 'ios' })).toMatch(/^uber:\/\/\?/);
    expect(buildUberUrl({ destination: HOTEL, platform: 'android' })).toMatch(/^uber:\/\/\?/);
    expect(buildUberUrl({ destination: HOTEL, platform: 'desktop' })).toMatch(
      /^https:\/\/m\.uber\.com\/ul\/\?/
    );
  });

  it('sets pickup coordinates from the origin', () => {
    const url = buildUberUrl({ origin: HOTEL, destination: RESTAURANT }) ?? '';
    expect(param(url, 'action')).toBe('setPickup');
    expect(param(url, 'pickup[latitude]')).toBe('45.433611');
    expect(param(url, 'pickup[longitude]')).toBe('12.34075');
    expect(param(url, 'pickup[nickname]')).toBe('Hotel Danieli');
    expect(param(url, 'dropoff[latitude]')).toBe('45.436');
    expect(param(url, 'dropoff[longitude]')).toBe('12.3405');
    expect(param(url, 'dropoff[nickname]')).toBe('Osteria alle Testiere');
  });

  it('uses my_location when there is no origin', () => {
    const url = buildUberUrl({ destination: HOTEL }) ?? '';
    expect(param(url, 'pickup')).toBe('my_location');
    expect(url).not.toContain('pickup[latitude]');
  });

  it('uses my_location when the origin has only an address', () => {
    const url = buildUberUrl({ origin: ADDRESS_ONLY, destination: HOTEL }) ?? '';
    expect(param(url, 'pickup')).toBe('my_location');
  });

  it('returns null without destination coordinates', () => {
    expect(buildUberUrl({ destination: ADDRESS_ONLY })).toBeNull();
    expect(buildUberUrl({ destination: NAME_ONLY })).toBeNull();
    expect(buildUberUrl({ destination: EMPTY })).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Lyft                                                                */
/* ------------------------------------------------------------------ */

describe('buildLyftUrl', () => {
  it('uses the native scheme on mobile and lyft.com on desktop', () => {
    expect(buildLyftUrl({ destination: HOTEL, platform: 'ios' })).toMatch(/^lyft:\/\/ridetype\?/);
    expect(buildLyftUrl({ destination: HOTEL, platform: 'android' })).toMatch(
      /^lyft:\/\/ridetype\?/
    );
    expect(buildLyftUrl({ destination: HOTEL, platform: 'desktop' })).toMatch(
      /^https:\/\/lyft\.com\/ride\?/
    );
  });

  it('always identifies the ride type and carries both endpoints', () => {
    const url = buildLyftUrl({ origin: HOTEL, destination: RESTAURANT }) ?? '';
    expect(param(url, 'id')).toBe('lyft');
    expect(param(url, 'pickup[latitude]')).toBe('45.433611');
    expect(param(url, 'pickup[longitude]')).toBe('12.34075');
    expect(param(url, 'destination[latitude]')).toBe('45.436');
    expect(param(url, 'destination[longitude]')).toBe('12.3405');
  });

  it('omits pickup when the origin has no coordinates', () => {
    const url = buildLyftUrl({ origin: NAME_ONLY, destination: HOTEL }) ?? '';
    expect(url).not.toContain('pickup');
  });

  it('returns null without destination coordinates', () => {
    expect(buildLyftUrl({ destination: ADDRESS_ONLY })).toBeNull();
    expect(buildLyftUrl({ destination: EMPTY })).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Encoding                                                            */
/* ------------------------------------------------------------------ */

describe('URL encoding', () => {
  it('percent-encodes commas, ampersands, spaces, plus, hash and non-ASCII', () => {
    const url = buildAppleMapsUrl({ destination: NASTY }) ?? '';
    // Raw separators must not leak into the query.
    const daddrRaw = url.slice(url.indexOf('daddr=') + 'daddr='.length).split('&')[0];
    expect(daddrRaw).not.toContain(',');
    expect(daddrRaw).not.toContain(' ');
    expect(daddrRaw).not.toContain('#');
    expect(daddrRaw).not.toContain('+');
    expect(daddrRaw).toContain('%20');
    expect(daddrRaw).toContain('%2C');
    expect(daddrRaw).toContain('%26');
    expect(daddrRaw).toContain('%23');
    expect(daddrRaw).toContain('%2B');
    // ...and round-trips exactly.
    expect(param(url, 'daddr')).toBe('1 Straße & Co, Süd #3 + Ost, 東京都');
  });

  it('encodes spaces as %20 rather than + so custom schemes parse correctly', () => {
    const url = buildAppleMapsUrl({ destination: { name: 'Gare du Nord' } }) ?? '';
    expect(url).toContain('Gare%20du%20Nord');
    expect(url).not.toContain('Gare+du+Nord');
  });

  it('encodes labels embedded in Uber and Citymapper params', () => {
    const nastyWithCoords: MapsPlace = { ...NASTY, latitude: 48.2, longitude: 16.37 };

    const uber = buildUberUrl({ destination: nastyWithCoords }) ?? '';
    expect(param(uber, 'dropoff[nickname]')).toBe('Café & Bar "Zoë"');

    const citymapper = buildCitymapperUrl({ destination: nastyWithCoords }) ?? '';
    expect(param(citymapper, 'endname')).toBe('Café & Bar "Zoë"');
  });

  it('encodes the parenthesised label inside a geo: query', () => {
    const url = buildGoogleMapsUrl({
      destination: { name: 'Café & Bar', latitude: 48.2, longitude: 16.37 },
      platform: 'android',
    }) ?? '';
    expect(url).not.toContain('&Bar');
    expect(param(url, 'q')).toBe('48.2,16.37(Café & Bar)');
  });

  it('does not double-encode text that already contains a percent sign', () => {
    const url = buildAppleMapsUrl({ destination: { name: '100% Chocolate Cafe' } }) ?? '';
    expect(url).toContain('100%25%20Chocolate');
    expect(param(url, 'daddr')).toBe('100% Chocolate Cafe');
  });
});

/* ------------------------------------------------------------------ */
/* Coordinate formatting                                               */
/* ------------------------------------------------------------------ */

describe('coordinate formatting', () => {
  it('rounds to six decimal places', () => {
    const url =
      buildAppleMapsUrl({ destination: { latitude: 1.123456789, longitude: -2.987654321 } }) ?? '';
    expect(param(url, 'daddr')).toBe('1.123457,-2.987654');
  });

  it('does not pad short coordinates with trailing zeros', () => {
    const url = buildAppleMapsUrl({ destination: { latitude: 1.5, longitude: -2 } }) ?? '';
    expect(param(url, 'daddr')).toBe('1.5,-2');
  });

  it('normalises negative zero to 0', () => {
    const url = buildAppleMapsUrl({ destination: { latitude: -0, longitude: 0 } }) ?? '';
    expect(param(url, 'daddr')).toBe('0,0');
  });
});

/* ------------------------------------------------------------------ */
/* Dispatch and menu assembly                                          */
/* ------------------------------------------------------------------ */

describe('buildDirectionsUrl', () => {
  it('dispatches to the matching builder for every app and platform', () => {
    for (const platform of PLATFORMS) {
      const request = { origin: HOTEL, destination: RESTAURANT, platform };
      expect(buildDirectionsUrl('apple', request)).toBe(buildAppleMapsUrl(request));
      expect(buildDirectionsUrl('google', request)).toBe(buildGoogleMapsUrl(request));
      expect(buildDirectionsUrl('citymapper', request)).toBe(buildCitymapperUrl(request));
      expect(buildDirectionsUrl('uber', request)).toBe(buildUberUrl(request));
      expect(buildDirectionsUrl('lyft', request)).toBe(buildLyftUrl(request));
    }
  });

  it('returns null for every app when the destination is unusable', () => {
    for (const app of MAPS_APPS) {
      expect(buildDirectionsUrl(app, { destination: EMPTY })).toBeNull();
    }
  });
});

describe('buildMapsAppLinks', () => {
  it('offers all five apps for a fully-located route', () => {
    const links = buildMapsAppLinks({ origin: HOTEL, destination: RESTAURANT });
    expect(links.map((link) => link.app)).toEqual([
      'apple',
      'google',
      'citymapper',
      'uber',
      'lyft',
    ]);
    for (const link of links) {
      expect(link.label).toBe(MAPS_APP_LABELS[link.app]);
      expect(link.description.length).toBeGreaterThan(0);
      expect(link.url.length).toBeGreaterThan(0);
    }
  });

  it('drops the coordinate-only apps for an address-only destination', () => {
    const links = buildMapsAppLinks({ destination: ADDRESS_ONLY });
    expect(links.map((link) => link.app)).toEqual(['apple', 'google']);
  });

  it('drops the coordinate-only apps for a name-only destination', () => {
    const links = buildMapsAppLinks({ destination: NAME_ONLY });
    expect(links.map((link) => link.app)).toEqual(['apple', 'google']);
  });

  it('returns nothing at all when the destination is unusable', () => {
    expect(buildMapsAppLinks({ destination: EMPTY })).toEqual([]);
  });

  it('hoists the preferred app to the front without dropping the rest', () => {
    const links = buildMapsAppLinks({ destination: HOTEL }, 'uber');
    expect(links.map((link) => link.app)).toEqual([
      'uber',
      'apple',
      'google',
      'citymapper',
      'lyft',
    ]);
  });

  it('leaves the order alone when the preferred app is already first', () => {
    const links = buildMapsAppLinks({ destination: HOTEL }, 'apple');
    expect(links.map((link) => link.app)).toEqual([
      'apple',
      'google',
      'citymapper',
      'uber',
      'lyft',
    ]);
  });

  it('ignores a preferred app that cannot serve this route', () => {
    const links = buildMapsAppLinks({ destination: ADDRESS_ONLY }, 'lyft');
    expect(links.map((link) => link.app)).toEqual(['apple', 'google']);
  });

  it('treats null and undefined preferences as no preference', () => {
    const base = buildMapsAppLinks({ destination: HOTEL }).map((link) => link.app);
    expect(buildMapsAppLinks({ destination: HOTEL }, null).map((l) => l.app)).toEqual(base);
    expect(buildMapsAppLinks({ destination: HOTEL }, undefined).map((l) => l.app)).toEqual(base);
  });

  it('builds platform-appropriate URLs for the whole menu', () => {
    const ios = buildMapsAppLinks({ destination: HOTEL, platform: 'ios' });
    expect(ios.find((l) => l.app === 'apple')?.url).toMatch(/^maps:\/\//);
    expect(ios.find((l) => l.app === 'uber')?.url).toMatch(/^uber:\/\//);

    const desktop = buildMapsAppLinks({ destination: HOTEL, platform: 'desktop' });
    for (const link of desktop) {
      expect(link.url).toMatch(/^https:\/\//);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Platform detection                                                  */
/* ------------------------------------------------------------------ */

describe('detectMapsPlatform', () => {
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const ANDROID =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
  const MAC =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  it('trusts the iOS flag from useIOSDetection over the user agent', () => {
    // iPadOS 13+ reports a Mac user agent; the hook still flags it as iOS.
    expect(detectMapsPlatform({ isIOS: true, userAgent: MAC })).toBe('ios');
    expect(detectMapsPlatform({ isIOS: true, userAgent: IPHONE })).toBe('ios');
  });

  it('detects Android from the user agent, case-insensitively', () => {
    expect(detectMapsPlatform({ isIOS: false, userAgent: ANDROID })).toBe('android');
    expect(detectMapsPlatform({ isIOS: false, userAgent: 'something ANDROID here' })).toBe(
      'android'
    );
  });

  it('falls back to desktop', () => {
    expect(detectMapsPlatform({ isIOS: false, userAgent: MAC })).toBe('desktop');
    expect(detectMapsPlatform({ isIOS: false, userAgent: '' })).toBe('desktop');
  });

  it('prefers iOS when both signals somehow fire', () => {
    expect(detectMapsPlatform({ isIOS: true, userAgent: ANDROID })).toBe('ios');
  });
});

/* ------------------------------------------------------------------ */
/* describeRoute                                                       */
/* ------------------------------------------------------------------ */

describe('describeRoute', () => {
  it('names both ends when an origin is inferred', () => {
    expect(describeRoute({ origin: HOTEL, destination: RESTAURANT })).toBe(
      'Directions from Hotel Danieli to Osteria alle Testiere'
    );
  });

  it('names only the destination without an origin', () => {
    expect(describeRoute({ destination: RESTAURANT })).toBe(
      'Directions to Osteria alle Testiere'
    );
  });

  it('uses the query text when a place has no name', () => {
    expect(describeRoute({ destination: ADDRESS_ONLY })).toBe(
      'Directions to Kärntner Straße 1, 1010 Wien, Österreich'
    );
  });

  it('falls back gracefully for unlabelled coordinates', () => {
    expect(describeRoute({ destination: { latitude: 1, longitude: 2 } })).toBe(
      'Directions to destination'
    );
  });

  it('degrades to a bare label when the destination is unusable', () => {
    expect(describeRoute({ destination: EMPTY })).toBe('Directions');
  });
});

/* ------------------------------------------------------------------ */
/* Purity                                                              */
/* ------------------------------------------------------------------ */

describe('purity', () => {
  it('never mutates the places it is given', () => {
    const origin: MapsPlace = { ...HOTEL };
    const destination: MapsPlace = { ...RESTAURANT };
    buildMapsAppLinks({ origin, destination, platform: 'ios' }, 'google');
    expect(origin).toEqual(HOTEL);
    expect(destination).toEqual(RESTAURANT);
  });

  it('is deterministic across repeated calls', () => {
    const request = { origin: HOTEL, destination: RESTAURANT, platform: 'android' } as const;
    for (const app of MAPS_APPS) {
      expect(buildDirectionsUrl(app, request)).toBe(buildDirectionsUrl(app, request));
    }
  });
});
