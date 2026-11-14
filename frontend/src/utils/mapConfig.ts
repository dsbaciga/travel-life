export interface MapTileConfig {
  url: string;
  attribution: string;
  maxZoom: number;
}

/**
 * CARTO basemaps require a free API key (https://carto.com/basemaps/apikey).
 * Requests without one are answered with an "API KEY REQUIRED" placeholder tile
 * instead of a map. The key is baked into the bundle at build time.
 */
const CARTO_API_KEY = (import.meta.env.VITE_CARTO_API_KEY as string | undefined)?.trim() ?? '';

/** Append the CARTO key as `?key=` (CARTO expects exactly this parameter name). */
function withCartoKey(url: string): string {
  return CARTO_API_KEY ? `${url}?key=${encodeURIComponent(CARTO_API_KEY)}` : url;
}

const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export const MAP_TILES = {
  standard: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  light: {
    url: withCartoKey('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'),
    attribution: CARTO_ATTRIBUTION,
    maxZoom: 20,
  },
  dark: {
    url: withCartoKey('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'),
    attribution: CARTO_ATTRIBUTION,
    maxZoom: 20,
  },
  /** CARTO Voyager: full colour like the standard map, with English labels. */
  voyager: {
    url: withCartoKey('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'),
    attribution: CARTO_ATTRIBUTION,
    maxZoom: 20,
  },
} as const;

/**
 * Which tiles a map uses.
 *
 * - Labels are in English wherever possible. OpenStreetMap's own tiles label
 *   each place in its local language, so they are only the fallback.
 * - Dark mode does not get a dark basemap: CARTO's dark tiles were hard to
 *   read. It uses Voyager, which is full colour.
 * - Without a CARTO key every CARTO tile is an "API KEY REQUIRED"
 *   placeholder, so fall back to OpenStreetMap rather than show a broken map.
 *   That fallback is the one case where labels are not in English.
 * - `useCustomStyle` (the Custom Map Style setting) picks the softer grey
 *   style in light mode; switched off, light mode uses Voyager too.
 */
export function getMapTileConfig(
  isDarkMode: boolean,
  useCustomStyle: boolean
): MapTileConfig {
  if (!CARTO_API_KEY) return MAP_TILES.standard;
  if (isDarkMode || !useCustomStyle) return MAP_TILES.voyager;
  return MAP_TILES.light;
}
