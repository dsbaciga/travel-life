/**
 * Writes mobile/app.json for a release build.
 *
 * app.json is git-ignored because it holds the Google Maps key, so a clean
 * checkout (CI) has only app.json.example. This fills in the three values a
 * release needs and leaves everything else as the example has it:
 *
 *   APP_VERSION                   e.g. "6.3.0" or "v6.3.0" (default: package.json)
 *   GOOGLE_MAPS_ANDROID_API_KEY   baked into the Android manifest
 *
 * Usage: node scripts/write-app-config.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => JSON.parse(readFileSync(join(root, name), 'utf8'));

const version = (process.env.APP_VERSION || read('package.json').version).replace(/^v/, '');
const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
if (!match) {
  console.error(`APP_VERSION "${version}" is not MAJOR.MINOR.PATCH`);
  process.exit(1);
}
const [major, minor, patch] = match.slice(1).map(Number);
if (minor > 999 || patch > 999) {
  console.error(`APP_VERSION "${version}": minor and patch must be below 1000`);
  process.exit(1);
}

const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
if (!mapsKey) {
  console.error('GOOGLE_MAPS_ANDROID_API_KEY is not set; the map would render blank.');
  process.exit(1);
}

const config = read('app.json.example');
config.expo.version = version;
// Android only installs an update whose versionCode is higher than the
// installed one, so derive it from the version: 6.3.1 -> 6003001.
config.expo.android.versionCode = major * 1_000_000 + minor * 1_000 + patch;
config.expo.android.config.googleMaps.apiKey = mapsKey;

writeFileSync(join(root, 'app.json'), `${JSON.stringify(config, null, 2)}\n`);
console.log(`app.json written: version ${version}, versionCode ${config.expo.android.versionCode}`);
