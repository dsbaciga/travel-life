/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Free CARTO basemaps key (https://carto.com/basemaps/apikey), baked in at build time. */
  readonly VITE_CARTO_API_KEY?: string;
}

interface Window {
  workbox?: import('workbox-window').Workbox;
}

// NOTE: keep this file free of top-level imports/exports — it must stay a global
// script for the declarations above to be global. Module augmentations (e.g. for
// 'react') belong in their own module file; see ./types/react-css-properties.d.ts.
