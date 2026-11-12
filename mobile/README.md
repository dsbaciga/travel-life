# Travel Life Companion (mobile)

The on-trip companion app: an offline mirror of your upcoming and current trips with live
itinerary editing, entity linking, quick capture and background route logging. Built with
Expo (SDK 58) and React Native; Android is the supported target. See the
[plan](../docs/plans/COMPANION_APP_PLAN.md) for the full design and its implementation status.

## Running it

The app uses native modules (SQLite, background location, widgets, share intents, ML Kit), so
it needs a **development build** — it will not run in Expo Go.

```bash
cd mobile
npm install
cp app.json.example app.json
npx expo run:android
```

`app.json` is git-ignored so API keys never reach the repository; `app.json.example` is the
committed template. When you change app configuration (plugins, permissions, widgets), make the
same change in both files.

Before building, set a Google Maps Android API key in `app.json` under
`expo.android.config.googleMaps.apiKey`; without one the Map tab renders a blank grid.
Push notifications additionally need an EAS project id (`expo.extra.eas.projectId`).

Release APKs are built and signed by CI on every version tag and attached to the GitHub
Release; see [Build and Push](../docs/guides/BUILD_AND_PUSH.md#android-companion-app). CI
writes its own `app.json` from the example with `scripts/write-app-config.mjs`.

The Maps key is compiled into the APK, so anyone with the APK can read it. Restrict it in the
Google Cloud console to the Maps SDK for Android, the package `dev.travellife.companion` and
your signing certificate's SHA-1.

### Building on Windows

The C++ part of the build produces paths longer than 260 characters, which the ninja bundled
with the Android SDK (1.10) cannot open. Two things together get a build through:

1. **A ninja that supports long paths** (1.12 or newer; Visual Studio Build Tools ships one)
   with Windows long paths enabled (`LongPathsEnabled = 1`). Point `NINJA_LONG_PATHS` at it and
   pass the init script, which leaves the SDK and the generated `android/` folder untouched.
2. **A short project path.** Copy `mobile/` somewhere like `C:\tl\mobile` (a `subst` drive is
   not enough: the build resolves it back to the real path).

```bat
set NINJA_LONG_PATHS=C:\path\to\ninja.exe
cd C:\tl\mobile\android
gradlew assembleDebug --init-script ..\scripts\windows-long-paths.init.gradle
```

`gradlew` also needs `JAVA_HOME` (Android Studio's `jbr` folder works) and `ANDROID_HOME`.
[EAS Build](https://docs.expo.dev/build/introduction/) avoids all of this by building in the
cloud.

To sign in, open the web app → **Settings → Integrations → Mobile App → Pair Mobile App** and
scan the QR code, or enter the server address and sign in with a password or SSO.

### Trying it on an emulator with a local backend

```bash
node scripts/dev-seed.mjs
```

This registers a test account on `http://localhost:5000/api` and creates one in-progress trip.
The credentials are generated on first run and kept in `.env.test.local` (git-ignored). In the
app, connect to `http://10.0.2.2:5000` (the emulator's name for your computer) and sign in with
them. Start Metro with `npm start` before opening a debug build.

After changing `app.json` (for example adding the Maps key), run `npx expo prebuild --platform
android` and rebuild: the key is baked into the native project, not read at runtime.

## Checks

```bash
npm test                              # Vitest: db, sync engine, domain logic, API client
npm run typecheck                     # the app
npx tsc --noEmit -p tsconfig.test.json  # the tests
npx eslint src
npx expo-doctor
```

## Layout

| Path | What lives there |
| ---- | ---------------- |
| `src/app/` | Expo Router screens. `(tabs)/` holds Today, Map, Trip and Vault |
| `src/components/` | Shared UI: form, timeline row, link section, action sheet |
| `src/db/` | `SqlDriver` interface, schema/migrations, typed repository |
| `src/sync/` | Outbox queue, request builders, sync engine (pull, flush, id remap, conflicts) |
| `src/domain/` | Pure logic: mutations, timeline, auto-linking, share parsing, track buffer |
| `src/lib/` | App wiring: session, API client, sync orchestration, hooks, theme |
| `src/tasks/` | Background location task, push registration, Android widget |
| `src/test/` | Node SQLite driver and an in-memory fake API for tests |

Shared domain code comes from [`packages/shared`](../packages/shared) via a Metro resolver
(`metro.config.js`) and a TypeScript path alias — there is no build or publish step.

## How offline works

Every screen reads from SQLite, never from the network, so the UI is the same with or without
signal.

- **Writes** go to SQLite and to an **outbox** row in one transaction
  ([`domain/mutations.ts`](src/domain/mutations.ts)). Things created offline get a
  `local_<uuid>` id.
- **Sync** is `pull → flush → pull` ([`sync/engine.ts`](src/sync/engine.ts)). The flush replays
  the outbox in causal order (locations before the activities that point at them, links last).
  When a create returns its server id, that id is rewritten everywhere the local one appeared:
  the row itself, foreign keys in other rows, both ends of entity links, and queued payloads.
- **Conflicts** are detected per field. If a collaborator changed a *different* field, both
  edits survive. If they changed the *same* field, the edit is held and shown side by side in
  **Sync** for a "keep mine / keep theirs" decision. Nothing is overwritten silently.
- **One connection, serialized.** The UI and the sync engine share a SQLite connection;
  [`createSerializedDriver`](src/db/driver.ts) queues transactions so a rollback in one can
  never discard the other's writes.

## Testing approach

The offline core has no React Native imports. It talks to a small `SqlDriver` interface, so the
tests run it against Node's built-in SQLite (the same SQL dialect) and a fake API that enforces
what matters for sync correctness: references must be real server ids, links are unique per
pair, unknown ids are 404. The suite includes the plan's end-to-end flow — create a Location,
an Activity and the link between them offline, reschedule an existing activity, reconnect, and
verify the server.

Screens and native modules are not covered by automated tests; they are typechecked, linted
and bundled.
