# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repository. Everything detailed lives in
`docs/`; this file is the map plus the rules that are easy to get wrong. Index: [docs/README.md](docs/README.md).

## Project

Travel Life is a full-stack travel documentation app (trips, places, photos, transportation,
lodging, journal, budget, documents, offline use) with an Android companion app. It is
production-ready for personal use and self-hosted (Docker; Node 26). History is in
[CHANGELOG.md](CHANGELOG.md); planned work in [Feature Backlog](docs/development/FEATURE_BACKLOG.md).

## Repository layout

| Path | What | Read first |
| ---- | ---- | ---------- |
| `backend/` | Express 4 + Prisma 7 + PostgreSQL/PostGIS + Zod 4, tests in Jest | [Backend Architecture](docs/architecture/BACKEND_ARCHITECTURE.md), [backend/CLAUDE.md](backend/CLAUDE.md) (all env vars) |
| `frontend/` | React 19 + Vite + Tailwind + TanStack Query + Zustand, tests in Vitest, PWA | [Frontend Architecture](docs/architecture/FRONTEND_ARCHITECTURE.md), [frontend/CLAUDE.md](frontend/CLAUDE.md) |
| `mobile/` | Expo / React Native Android companion (offline SQLite mirror + outbox sync) | [Mobile and Shared](docs/architecture/MOBILE_AND_SHARED.md), `mobile/AGENTS.md` (loaded automatically in `mobile/`) |
| `packages/shared/` | `@travel-life/shared`: pure domain code used by mobile and (vendored) backend | [Mobile and Shared](docs/architecture/MOBILE_AND_SHARED.md) |
| `docs/` | All documentation | [docs/README.md](docs/README.md) |
| `conductor/`, `tools/`, `branding/` | Planning workspace, release verification, logos. Not the source of truth for code | |

Each directory has its own `package.json`/`node_modules`; run commands from inside it.

## Where to look

| Need | Document |
| ---- | -------- |
| **Find where a feature lives, or a helper to reuse** | [Feature Map](docs/architecture/FEATURE_MAP.md) — check it *before* writing a new helper |
| **Write code that fits the codebase** | [Code Conventions](docs/architecture/CODE_CONVENTIONS.md) (**required before writing code**) |
| **Work on the UI** | [Style Guide](docs/architecture/STYLE_GUIDE.md) (**required**) |
| **Write any user-facing text** (toasts, errors, empty states, confirmations, labels) | [Voice and Tone](docs/guides/VOICE_AND_TONE.md) (**required**); strings still to rewrite are in the [Copy Audit](docs/guides/COPY_AUDIT.md) |
| Database | [Database Schema](docs/architecture/DATABASE_SCHEMA.md) (`backend/prisma/schema.prisma` is the authority) |
| API | [API Reference](docs/api/README.md); live Swagger comments sit above each route |
| Step-by-step feature work | [Development Workflows](docs/guides/DEVELOPMENT_WORKFLOWS.md) |
| Tests | [Testing Guide](docs/guides/TESTING_GUIDE.md) |
| Debugging / performance | [Debugging & Optimization](docs/guides/DEBUGGING_AND_OPTIMIZATION.md) |
| Deploying / releasing | [Deployment](DEPLOYMENT.md), [Quick Start](QUICK_START_PRODUCTION.md), [Build & Push](docs/guides/BUILD_AND_PUSH.md), [Release Checklist](RELEASE_CHECKLIST.md) |
| Progress | [Implementation Status](docs/development/IMPLEMENTATION_STATUS.md) (stops at v5.6.1; use the CHANGELOG after that) |

Architecture in one line: backend **Routes → Controllers → Services → Prisma → DB**; frontend
**Pages → Components → Services → axios → Zustand/TanStack Query**. Controllers hold no business
logic; services own every permission check; components never call `axios` directly.

## Commands

Standard scripts (`dev`, `build`, `test`, `lint`, `prisma:*`) are in each `package.json`. The non-obvious ones:

- Backend: `npm run build:strict` (full strict type-check; `build` uses `tsconfig.prod.json`). Real strict baselines exist, so compare against a clean `main` before blaming your change
- Frontend: `npm run build` (`tsc -b tsconfig.prod.json && vite build`), `npm run build:strict`, `npm run analyze` (`analyze:win` on Windows), `npm run test:run`
- Root: `npm run test:backend|test:frontend|test:shared|test:mobile`, `npm run sync:vendored`
- Migrations: `docker exec -it travel-life-backend npx prisma migrate dev` (dev), `... migrate deploy` (prod). Schema changes need a migration file in `backend/prisma/migrations/`
- Shell is Git Bash/PowerShell on Windows: prefer the dedicated file tools, avoid apostrophes in heredocs, run frontend Vitest from a path with an uppercase drive letter (`C:/...`)

Ports: frontend 3000 (Docker) / 5173 (Vite), backend 5000, Postgres 5432, Nominatim 8080. The
backend's CORS allows only 3000 and 5173 by default, so sign in from one of those.

## Rules that are easy to get wrong

### Git and releases

- **Never push to `main`.** Branch, open a PR, merge through it — including version bumps. `release.ps1` opens a release PR and then pushes only the tag; it cannot run from a worktree, where [Build & Push](docs/guides/BUILD_AND_PUSH.md#never-push-to-main--releases-go-through-a-pr) gives the manual steps.
- **For "build and deploy", "build and push", "release", or similar: read [docs/guides/BUILD_AND_PUSH.md](docs/guides/BUILD_AND_PUSH.md) in full first and follow it step by step.** No shortcuts or improvisation; it keeps version numbers, images, tags and docs consistent. If unsure, stop and ask.
- Add user-facing changes to `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) as you work; the release script promotes it and CI uses it as the release notes.

### Backend

- Errors: `throw new AppError('Resource not found', 404)` (`src/errors/errors.ts`).
- Response envelope: `{ status: 'success' | 'error', data?, message? }`.
- Zod update schemas use `.nullable().optional()` (see `validation/zodHelpers.ts`); mismatch is the usual cause of "Validation failed".
- **No `src/utils/` directory** — put helpers in the topical directory (`auth/`, `http/`, `prisma/`, `security/`, `validation/`, `services/_shared/`).
- **`services/_shared/vendored/` is generated** from `packages/shared`; edit the source and run `npm run sync:vendored`.
- Outbound URLs that users configure (Immich, LLM, SMTP) go through `security/urlValidation.ts`; text going into an LLM prompt goes through `security/promptSafety.ts`.
- Lat/lng are validated (-90..90, -180..180). Uploads use `multer`, `sharp`, `exifr`, stored under `uploads/`.
- Check [backend/CLAUDE.md](backend/CLAUDE.md) for env vars; add any new variable there.

### Frontend

- `lib/axios.ts` unwraps the `{ status, data }` envelope: type calls with the *unwrapped* payload (`axios.get<Foo[]>(url)`, `return response.data`). Services throw; components catch or use query error states.
- After a mutation, call `onUpdate?.()` / invalidate queries or the UI looks stale.
- Forms: use `useSubmitLock`, `useSaveAndAddAnother`, `CurrencySelect` and friends — see [Code Conventions: Forms](docs/architecture/CODE_CONVENTIONS.md#forms-the-shared-hooks-and-components). Never `setState` then `requestSubmit()`; never render a dialog inside a menu that unmounts when it closes.
- Currency is always a `CurrencySelect`, never free text. Distances and temperatures go through `useUnits` / `utils/units.ts` (the user's imperial/metric setting), never hard-coded km or mi.
- Avoid `any`: use proper types, `unknown` with narrowing, generics or unions.

### Timezones

**Never fall back to UTC for display.** Resolve from most to least specific:
`entity.timezone → trip.timezone → user.timezone → browser timezone → UTC` (UTC only as a last resort).

- Frontend: `const resolveTz = useTimezoneResolver(); resolveTz(activity.timezone, tripTimezone)`. Outside React, `resolveTimezone(...)` from `utils/timezone.ts` with the user's zone passed in. Never read `Intl.DateTimeFormat().resolvedOptions().timeZone` directly (skips the user's setting) and never write `|| 'UTC'`.
- Backend: `resolveTimezone(...)` and `getUserTimezone(userId)` in `services/_shared/timezoneResolution.ts`; end any chain that groups or formats dates for a user with that user's zone.
- **Date-only values** (`@db.Date` columns: trip start/end, expense dates) are UTC-midnight calendar dates: format with `formatDateOnly()`. To bucket a real timestamp onto a calendar day use `dayKeyInTimezone()`; slicing the ISO string files evening events under the wrong day.
- The user's timezone is on the auth session payload (`types/auth.ts` `User.timezone`).

### Testing against reality

Mocked unit tests have missed real bugs in Prisma and dependency changes. For those, smoke-test against a real PostgreSQL (a throwaway container, or the local dev database), not just Jest mocks.

## Documentation upkeep

- When you add a feature, service, hook, shared helper or env var, update the matching doc: [Feature Map](docs/architecture/FEATURE_MAP.md) for features and reusable helpers, `backend/CLAUDE.md` / `frontend/CLAUDE.md` for env vars, the architecture doc for new patterns, [docs/README.md](docs/README.md) for new documents.
- Prefer pointing at code over copying it; numbers (model counts, endpoint counts) go stale, so give the command that produces them.
- Markdown: blank lines around headings, lists and fenced code blocks; fenced blocks always carry a language.
