/**
 * Deep-link builders for external maps and rideshare apps.
 *
 * Every function in this module is PURE and side-effect free: no `window`,
 * no `navigator`, no `Date`. Platform is always passed in explicitly so the
 * builders can be unit tested exhaustively. Use `detectMapsPlatform` (also
 * pure) at the edge to turn browser signals into a `MapsPlatform`.
 */

export const MAPS_APPS = ['apple', 'google', 'citymapper', 'uber', 'lyft'] as const;
export type MapsApp = (typeof MAPS_APPS)[number];

export const MAPS_PLATFORMS = ['ios', 'android', 'desktop'] as const;
export type MapsPlatform = (typeof MAPS_PLATFORMS)[number];

export const TRAVEL_MODES = ['driving', 'walking', 'bicycling', 'transit'] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

/** Human-readable app names for menus and settings. */
export const MAPS_APP_LABELS: Record<MapsApp, string> = {
  apple: 'Apple Maps',
  google: 'Google Maps',
  citymapper: 'Citymapper',
  uber: 'Uber',
  lyft: 'Lyft',
};

/** Short description of what each app is good for. */
export const MAPS_APP_DESCRIPTIONS: Record<MapsApp, string> = {
  apple: 'Driving, walking and transit directions',
  google: 'Driving, walking, cycling and transit directions',
  citymapper: 'Public transit routing in supported cities',
  uber: 'Request a ride to the destination',
  lyft: 'Request a ride to the destination',
};

export function isMapsApp(value: unknown): value is MapsApp {
  return typeof value === 'string' && MAPS_APPS.some((app) => app === value);
}

export function isTravelMode(value: unknown): value is TravelMode {
  return typeof value === 'string' && TRAVEL_MODES.some((mode) => mode === value);
}

export function isMapsPlatform(value: unknown): value is MapsPlatform {
  return typeof value === 'string' && MAPS_PLATFORMS.some((platform) => platform === value);
}

/**
 * A place we can navigate to. Every field is optional because itinerary
 * entities carry wildly different amounts of detail: a `Location` usually has
 * coordinates, a `Lodging` normally only has a postal address, and a
 * transportation leg may only have a station name.
 */
export interface MapsPlace {
  name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * A place reduced to the single best representation an app can consume:
 * coordinates when we have them, otherwise a free-text query.
 */
export type ResolvedPlace =
  | {
      readonly kind: 'coords';
      readonly latitude: number;
      readonly longitude: number;
      /** Display label (name, falling back to address). May be null. */
      readonly label: string | null;
    }
  | { readonly kind: 'query'; readonly query: string };

type CoordsPlace = Extract<ResolvedPlace, { kind: 'coords' }>;

export interface DirectionsRequest {
  /** Where the user wants to end up. */
  destination: MapsPlace;
  /**
   * Where they are starting from — normally the previous itinerary item.
   * Omit (or pass null) to let the app use the device's current location.
   */
  origin?: MapsPlace | null;
  /** Defaults to `'driving'`. Ignored by Citymapper (transit only) and rideshares. */
  mode?: TravelMode;
  /** Defaults to `'desktop'`. */
  platform?: MapsPlatform;
}

/* ------------------------------------------------------------------ */
/* Place resolution                                                    */
/* ------------------------------------------------------------------ */

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

/**
 * Reduce a place to coordinates, else an address string, else a name string.
 * Returns null when the place carries nothing usable.
 */
export function resolvePlace(place: MapsPlace | null | undefined): ResolvedPlace | null {
  if (!place) return null;

  const name = trimToNull(place.name);
  const address = trimToNull(place.address);

  if (isValidLatitude(place.latitude) && isValidLongitude(place.longitude)) {
    return {
      kind: 'coords',
      latitude: place.latitude,
      longitude: place.longitude,
      label: name ?? address,
    };
  }

  // No usable coordinates — fall back to text. A postal address geocodes more
  // reliably than a bare venue name, so it wins.
  const query = address ?? name;
  return query === null ? null : { kind: 'query', query };
}

/** True when the place can produce at least one working deep link. */
export function hasUsableLocation(place: MapsPlace | null | undefined): boolean {
  return resolvePlace(place) !== null;
}

/**
 * Walk backwards from `index` and return the nearest preceding place that has
 * a usable location. Used to infer "origin" from the previous itinerary item
 * without being defeated by an intervening journal entry or untagged activity.
 */
export function pickPreviousPlace(
  places: ReadonlyArray<MapsPlace | null | undefined>,
  index: number
): MapsPlace | null {
  for (let i = Math.min(index, places.length) - 1; i >= 0; i -= 1) {
    const candidate = places[i];
    if (hasUsableLocation(candidate)) {
      // hasUsableLocation guarantees candidate is a non-null MapsPlace.
      return candidate ?? null;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

/** Six decimal places is ~11cm of precision — plenty, and keeps URLs short. */
function formatCoord(value: number): string {
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function coordPair(place: CoordsPlace): string {
  return `${formatCoord(place.latitude)},${formatCoord(place.longitude)}`;
}

/**
 * Build a query string. Keys are ASCII literals defined in this file (some
 * carry `[]`, which the rideshare APIs expect verbatim); values are always
 * percent-encoded, so commas, ampersands and non-ASCII survive intact.
 */
function buildQuery(params: ReadonlyArray<readonly [string, string]>): string {
  return params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
}

function asCoords(place: ResolvedPlace | null): CoordsPlace | null {
  return place !== null && place.kind === 'coords' ? place : null;
}

/** The text a generic maps app should search for. */
function placeToText(place: ResolvedPlace): string {
  return place.kind === 'coords' ? coordPair(place) : place.query;
}

function placeLabel(place: ResolvedPlace): string | null {
  return place.kind === 'coords' ? place.label : place.query;
}

interface NormalizedRequest {
  readonly destination: ResolvedPlace;
  readonly origin: ResolvedPlace | null;
  readonly mode: TravelMode;
  readonly platform: MapsPlatform;
}

function normalize(request: DirectionsRequest): NormalizedRequest | null {
  const destination = resolvePlace(request.destination);
  if (destination === null) return null;

  return {
    destination,
    origin: resolvePlace(request.origin),
    mode: request.mode ?? 'driving',
    platform: request.platform ?? 'desktop',
  };
}

/* ------------------------------------------------------------------ */
/* Apple Maps                                                          */
/* ------------------------------------------------------------------ */

/**
 * Apple's `dirflg` only distinguishes driving / walking / transit. Cycling
 * has no documented flag, so it rides along with walking.
 */
function appleDirFlag(mode: TravelMode): string {
  switch (mode) {
    case 'walking':
    case 'bicycling':
      return 'w';
    case 'transit':
      return 'r';
    case 'driving':
      return 'd';
  }
}

export function buildAppleMapsUrl(request: DirectionsRequest): string | null {
  const normalized = normalize(request);
  if (normalized === null) return null;

  const params: Array<readonly [string, string]> = [];
  if (normalized.origin !== null) {
    params.push(['saddr', placeToText(normalized.origin)]);
  }
  params.push(['daddr', placeToText(normalized.destination)]);
  params.push(['dirflg', appleDirFlag(normalized.mode)]);

  // iOS registers the `maps://` scheme; everywhere else the https host works
  // in a browser and still hands off to Maps on macOS.
  const base = normalized.platform === 'ios' ? 'maps://' : 'https://maps.apple.com/';
  return `${base}?${buildQuery(params)}`;
}

/* ------------------------------------------------------------------ */
/* Google Maps                                                         */
/* ------------------------------------------------------------------ */

function googleTravelMode(mode: TravelMode): string {
  // Google's `travelmode` values happen to match our TravelMode union.
  return mode;
}

/**
 * Android's `geo:` URI can express a destination but has no notion of a route,
 * so it is only used when there is no origin. With an origin we fall back to
 * the https directions URL, which Android's intent filter still opens directly
 * in the Google Maps app.
 */
function buildGeoUri(destination: ResolvedPlace): string {
  // Narrow `destination` directly rather than via asCoords(): assigning to a new
  // variable checks that variable for null but leaves `destination` as the full
  // union, so the fallback branch below could not see `.query`.
  if (destination.kind === 'coords') {
    const pair = coordPair(destination);
    const query =
      destination.label === null ? pair : `${pair}(${destination.label})`;
    return `geo:${pair}?q=${encodeURIComponent(query)}`;
  }
  return `geo:0,0?q=${encodeURIComponent(destination.query)}`;
}

export function buildGoogleMapsUrl(request: DirectionsRequest): string | null {
  const normalized = normalize(request);
  if (normalized === null) return null;

  if (normalized.platform === 'android' && normalized.origin === null) {
    return buildGeoUri(normalized.destination);
  }

  const params: Array<readonly [string, string]> = [['api', '1']];
  if (normalized.origin !== null) {
    params.push(['origin', placeToText(normalized.origin)]);
  }
  params.push(['destination', placeToText(normalized.destination)]);
  params.push(['travelmode', googleTravelMode(normalized.mode)]);

  return `https://www.google.com/maps/dir/?${buildQuery(params)}`;
}

/* ------------------------------------------------------------------ */
/* Citymapper                                                          */
/* ------------------------------------------------------------------ */

/**
 * Citymapper needs an `endcoord` to plan anything — a link with only a name
 * just drops the user on the app's home screen — so this returns null unless
 * the destination has coordinates.
 */
export function buildCitymapperUrl(request: DirectionsRequest): string | null {
  const normalized = normalize(request);
  if (normalized === null) return null;

  const endCoords = asCoords(normalized.destination);
  if (endCoords === null) return null;

  const params: Array<readonly [string, string]> = [];

  const startCoords = asCoords(normalized.origin);
  if (startCoords !== null) {
    params.push(['startcoord', coordPair(startCoords)]);
    if (startCoords.label !== null) {
      params.push(['startname', startCoords.label]);
    }
  }

  params.push(['endcoord', coordPair(endCoords)]);
  if (endCoords.label !== null) {
    params.push(['endname', endCoords.label]);
  }

  const base =
    normalized.platform === 'desktop'
      ? 'https://citymapper.com/directions'
      : 'citymapper://directions';
  return `${base}?${buildQuery(params)}`;
}

/* ------------------------------------------------------------------ */
/* Rideshare                                                           */
/* ------------------------------------------------------------------ */

/**
 * Uber's deep link requires a dropoff latitude/longitude; an address string
 * alone is not enough, so this returns null without destination coordinates.
 */
export function buildUberUrl(request: DirectionsRequest): string | null {
  const normalized = normalize(request);
  if (normalized === null) return null;

  const dropoff = asCoords(normalized.destination);
  if (dropoff === null) return null;

  const params: Array<readonly [string, string]> = [['action', 'setPickup']];

  const pickup = asCoords(normalized.origin);
  if (pickup !== null) {
    params.push(['pickup[latitude]', formatCoord(pickup.latitude)]);
    params.push(['pickup[longitude]', formatCoord(pickup.longitude)]);
    if (pickup.label !== null) {
      params.push(['pickup[nickname]', pickup.label]);
    }
  } else {
    params.push(['pickup', 'my_location']);
  }

  params.push(['dropoff[latitude]', formatCoord(dropoff.latitude)]);
  params.push(['dropoff[longitude]', formatCoord(dropoff.longitude)]);
  if (dropoff.label !== null) {
    params.push(['dropoff[nickname]', dropoff.label]);
  }

  const base = normalized.platform === 'desktop' ? 'https://m.uber.com/ul/' : 'uber://';
  return `${base}?${buildQuery(params)}`;
}

/**
 * Lyft's deep link likewise requires destination coordinates.
 */
export function buildLyftUrl(request: DirectionsRequest): string | null {
  const normalized = normalize(request);
  if (normalized === null) return null;

  const destination = asCoords(normalized.destination);
  if (destination === null) return null;

  const params: Array<readonly [string, string]> = [['id', 'lyft']];

  const pickup = asCoords(normalized.origin);
  if (pickup !== null) {
    params.push(['pickup[latitude]', formatCoord(pickup.latitude)]);
    params.push(['pickup[longitude]', formatCoord(pickup.longitude)]);
  }

  params.push(['destination[latitude]', formatCoord(destination.latitude)]);
  params.push(['destination[longitude]', formatCoord(destination.longitude)]);

  const base = normalized.platform === 'desktop' ? 'https://lyft.com/ride' : 'lyft://ridetype';
  return `${base}?${buildQuery(params)}`;
}

/* ------------------------------------------------------------------ */
/* Dispatch                                                            */
/* ------------------------------------------------------------------ */

const BUILDERS: Record<MapsApp, (request: DirectionsRequest) => string | null> = {
  apple: buildAppleMapsUrl,
  google: buildGoogleMapsUrl,
  citymapper: buildCitymapperUrl,
  uber: buildUberUrl,
  lyft: buildLyftUrl,
};

/** Returns the deep link for `app`, or null when the app cannot serve this route. */
export function buildDirectionsUrl(app: MapsApp, request: DirectionsRequest): string | null {
  return BUILDERS[app](request);
}

export interface MapsAppLink {
  readonly app: MapsApp;
  readonly label: string;
  readonly description: string;
  readonly url: string;
}

/**
 * Every app that can actually handle this route, in `MAPS_APPS` order with the
 * user's preferred app hoisted to the front.
 */
export function buildMapsAppLinks(
  request: DirectionsRequest,
  preferredApp?: MapsApp | null
): MapsAppLink[] {
  const links: MapsAppLink[] = [];

  for (const app of MAPS_APPS) {
    const url = buildDirectionsUrl(app, request);
    if (url === null) continue;
    links.push({
      app,
      label: MAPS_APP_LABELS[app],
      description: MAPS_APP_DESCRIPTIONS[app],
      url,
    });
  }

  if (preferredApp === undefined || preferredApp === null) return links;

  const preferredIndex = links.findIndex((link) => link.app === preferredApp);
  if (preferredIndex <= 0) return links;

  const preferred = links[preferredIndex];
  return [preferred, ...links.filter((link) => link.app !== preferred.app)];
}

/* ------------------------------------------------------------------ */
/* Platform detection (pure)                                           */
/* ------------------------------------------------------------------ */

export interface PlatformSignals {
  /** From `useIOSDetection()` — it also catches iPadOS masquerading as macOS. */
  isIOS: boolean;
  userAgent: string;
}

export function detectMapsPlatform(signals: PlatformSignals): MapsPlatform {
  if (signals.isIOS) return 'ios';
  if (/android/i.test(signals.userAgent)) return 'android';
  return 'desktop';
}

/**
 * A short human summary of where the route starts and ends, for tooltips and
 * screen readers.
 */
export function describeRoute(request: DirectionsRequest): string {
  const destination = resolvePlace(request.destination);
  if (destination === null) return 'Directions';

  const destinationLabel = placeLabel(destination) ?? 'destination';
  const origin = resolvePlace(request.origin);
  if (origin === null) return `Directions to ${destinationLabel}`;

  const originLabel = placeLabel(origin) ?? 'current location';
  return `Directions from ${originLabel} to ${destinationLabel}`;
}
