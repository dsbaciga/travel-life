# Mobile App and Shared Package

The repository holds three code bases besides the web app's `backend/` and `frontend/`:

| Directory | What it is | Own docs |
| --------- | ---------- | -------- |
| `packages/shared/` | `@travel-life/shared`: pure, platform-agnostic domain code | this file |
| `mobile/` | Expo / React Native Android companion app (offline mirror of trips) | [mobile/README.md](../../mobile/README.md), [mobile/AGENTS.md](../../mobile/AGENTS.md) |
| `tools/release-verify/` | Release verification tooling | [README](../../tools/release-verify/README.md) |

Each has its own `package.json` and `node_modules`; the root `package.json` only holds
convenience scripts (`npm run test:shared`, `test:mobile`, `sync:vendored`, …).

## `packages/shared`

Code that must behave identically in the API, the web app and the phone: geo math, maps deep
links, opening-hours evaluation, timezone helpers, itinerary time shifting, the receipt
parser, nearby-food scoring, entity-link rules, country facts and the entity types/Zod schemas.
**No DOM, no React Native, no Node-only imports.** Entry point: `src/index.ts`.

### How each consumer imports it

| Consumer | Mechanism |
| -------- | --------- |
| `mobile/` | Metro resolver in `metro.config.js` plus a TypeScript path alias. No build or publish step |
| `frontend/` | **Does not import it.** The web app keeps its own copies of the equivalent helpers (see the note below) |
| `backend/` | **Vendored copies.** The backend Docker build context is `./backend`, so it cannot import from `packages/shared` |

### Vendoring into the backend

`packages/shared/scripts/sync-vendored.mjs` copies the few dependency-free modules the API
needs (currently `geo.ts`, `receiptParser.ts`, `nearbyFood.ts`) into
`backend/src/services/_shared/vendored/`. Rules:

- **Never edit `backend/src/services/_shared/vendored/*` by hand** — each file is marked
  `GENERATED FILE - DO NOT EDIT`. Edit the source in `packages/shared/src/` and run
  `npm run sync:vendored` from the repo root.
- Only modules with **no imports** may be vendored (list lives in `VENDORED` in the script).
- `node packages/shared/scripts/sync-vendored.mjs --check` exits 1 on drift, and a backend test
  (`VEND-001` in `services/__tests__/mobileCompanion.service.test.ts`) fails if a copy differs from its source.
- To vendor another module: make it import-free, add it to `VENDORED`, run the sync, commit both.

### Before adding code to shared

Put it here when two or more of backend/frontend/mobile need the same logic. Keep it
here-only-if-pure: anything touching `axios`, Prisma, `window`, or `react-native` belongs in the
consuming project. Add tests in `packages/shared/src/**/__tests__/` (Vitest, `npm run test:shared`).

Note the web frontend has its own copies of some helpers (`frontend/src/utils/timezone.ts`,
`utils/openingHours.ts`, `lib/mapsDeepLinks.ts`, `constants/countryFacts.ts`); when changing
behavior, check whether the shared version must change too.

## Mobile companion app (`mobile/`)

Expo (SDK 58) + React Native + Expo Router; Android is the supported target. Requires a
**development build**, not Expo Go. **Read [mobile/AGENTS.md](../../mobile/AGENTS.md) before touching Expo
APIs** — Expo APIs change every SDK, so look them up against the installed major version.

Layout, offline model (outbox, `local_<uuid>` ids, per-field conflict detection, serialized
SQLite driver), build instructions (including Windows long-path workarounds), the emulator
dev-seed script and the test approach are documented in [mobile/README.md](../../mobile/README.md).
Design intent and implementation status: [COMPANION_APP_PLAN.md](../plans/COMPANION_APP_PLAN.md).

Key rules:

- `mobile/app.json` is git-ignored (it holds API keys); `app.json.example` is the committed
  template. Config changes go in **both**.
- The offline core (`src/db`, `src/sync`, `src/domain`) has no React Native imports and is tested
  in Node against a fake API. Keep it that way; screens and native modules are only typechecked
  and linted.
- Run `npm test`, `npm run typecheck`, `npx tsc --noEmit -p tsconfig.test.json` and
  `npx eslint src` from `mobile/` before declaring work done.
- Plain `http` servers are refused unless on a local network (private IPs, `.local`, `localhost`).

### Backend surface used by the app

| Endpoint | Purpose | Code |
| -------- | ------- | ---- |
| `POST /api/auth/mobile/pairing-token` (auth) and `POST /api/auth/mobile/pair` | Mint and redeem a single-use QR pairing token that yields access + refresh tokens | `mobilePairing.service.ts`, `auth.controller.ts`, `auth/clientPlatform.ts` |
| `GET /api/trips/:tripId/mobile-sync[?since=]` | Whole-trip snapshot with the EntityLink graph; `since` returns a delta, but the `ids` lists always cover every row so deletions can be detected | `mobileSync.service.ts`, `mobile.routes.ts` |
| `POST /api/trips/:tripId/tracks/batch`, `GET /api/trips/:tripId/tracks` | Background route logging (batch upload; read one day's track) | `mobile.routes.ts`, `controllers/mobile.controller.ts`, `track.service.ts` |
| `POST /api/trips/:tripId/photos/infer-locations` | Place photos on the map from EXIF/track | `mobile.routes.ts`, `track.service.ts` |
| `POST /api/trips/:tripId/expenses/parse-receipt` | Receipt scanning | `mobile.routes.ts`, `receipt.service.ts` |
| `POST/DELETE /api/push/mobile-token` | Expo push token registration | `push.routes.ts`, `controllers/mobile.controller.ts`, `pushNotification.service.ts` |
| `GET /api/places/food`, `GET /api/places/search`, `/api/trips/:tripId/food-log` | Food tab: nearby search (Overpass), place lookup (Nominatim), food log | `places.routes.ts`, `nearbyFood.service.ts`, `placeSearch.service.ts`, `foodLog.service.ts` |

Gotchas:

- Mobile sync returns rows with **Prisma column names** (`scheduledStart`), not the web API's
  aliased response shapes (`departureTime`). The SQLite mirror is keyed on the schema.
- Native clients send `X-Client-Platform: mobile` (`auth/clientPlatform.ts`): auth endpoints then
  return the refresh token in the JSON body and set no cookies. Bearer-only requests skip CSRF
  (`security/csrf.ts`); the mobile token-exchange endpoints are explicit CSRF exemptions.
- Adding a synced entity means touching, in order: Prisma model → `mobileSync.service.ts` →
  `mobile/src/db/schema.ts` (new SQLite migration) → `mobile/src/sync/{payloads,engine,outbox}.ts`
  (flush order matters: parents before children, links last) → `mobile/src/domain/mutations.ts`.
