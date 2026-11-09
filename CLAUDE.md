# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Important References:**

All documentation is organized in the `docs/` folder. Start with the [Documentation Index](docs/README.md) for navigation.

## Quick Reference

| Need | Document |
| ---- | -------- |
| **Understand the codebase** | [Backend Architecture](docs/architecture/BACKEND_ARCHITECTURE.md), [Frontend Architecture](docs/architecture/FRONTEND_ARCHITECTURE.md) |
| **Write code that fits the codebase** | [Code Conventions](docs/architecture/CODE_CONVENTIONS.md) (**required reading before writing code**) |
| **Work on the UI** | [Style Guide](docs/architecture/STYLE_GUIDE.md) (**required reading**) |
| **Understand the database** | [Database Schema](docs/architecture/DATABASE_SCHEMA.md) |
| **Use the API** | [API Reference](docs/api/README.md) |
| **Deploy to production** | [Deployment Guide](DEPLOYMENT.md), [Quick Start](QUICK_START_PRODUCTION.md) |
| **Release a new version** | [Build & Push](docs/guides/BUILD_AND_PUSH.md), [Release Checklist](RELEASE_CHECKLIST.md) |
| **Track progress** | [Implementation Status](docs/development/IMPLEMENTATION_STATUS.md) |
| **Development workflows** | [Development Workflows](docs/guides/DEVELOPMENT_WORKFLOWS.md) |
| **Debug issues** | [Debugging & Optimization](docs/guides/DEBUGGING_AND_OPTIMIZATION.md) |
| **Optimize code** | [Debugging & Optimization](docs/guides/DEBUGGING_AND_OPTIMIZATION.md) |

## Project Overview

Travel Life is a full-stack travel documentation application built with a React frontend and Express backend. The application enables users to track trips with rich features including locations, photos, transportation, lodging, journal entries, and more.

**The application is production-ready for personal use.** See [Implementation Status](docs/development/IMPLEMENTATION_STATUS.md) for feature-by-feature progress and [Feature Backlog](docs/development/FEATURE_BACKLOG.md) for what's planned.

## Development Commands

Standard scripts (`dev`, `build`, `test`, `lint`, `preview`, `prisma:*`) are in each `package.json`. The non-obvious ones:

### Backend (run from `backend/` directory)

- `npm run build:strict` - Compile with full strict type-checking (`build` uses `tsconfig.prod.json`)

### Frontend (run from `frontend/` directory)

- `npm run build` - Build for production (`tsc -b tsconfig.prod.json && vite build`)
- `npm run build:strict` - Build with strict type-checking (`tsc -b && vite build`)
- `npm run analyze` - Build with bundle analyzer (`analyze:win` on Windows)

### Docker Commands (run from project root)

**Development:**

- `docker exec -it travel-life-backend npx prisma migrate dev` - Run migrations in container

**Production:**

- `./build.sh v1.0.0` (Linux/Mac) or `.\build.ps1 -Version v1.0.0` (Windows) - Build production images
- `docker-compose -f docker-compose.prod.yml --env-file .env.production up -d` - Start production services
- `docker exec travel-life-backend npx prisma migrate deploy` - Run production migrations

**Release Management:**

- `./release.sh patch|minor|major` (Linux/Mac) - Automated version bump, tagging, and build
- `.\release.ps1 -Version patch|minor|major` (Windows) - PowerShell release script with more features
- `.\release.ps1 -Version v1.2.3 -NoConfirm` - Non-interactive release with explicit version
- `.\release.ps1 -Version patch -DryRun` - Preview changes without executing
- See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) for full release process

## Build and Deployment Workflow

CRITICAL - READ THIS SECTION CAREFULLY.

When the user asks you to "build and deploy", "build and push", "push a new version", "release", or ANY similar deployment request:

### YOU MUST ONLY USE THE STEPS IN BUILD_AND_PUSH.md

**MANDATORY REQUIREMENTS:**

1. **FIRST ACTION**: Read [docs/guides/BUILD_AND_PUSH.md](docs/guides/BUILD_AND_PUSH.md) in its entirety
2. **FOLLOW EVERY STEP**: Execute the checklist systematically from start to finish
3. **NO SHORTCUTS**: Do not skip steps, assume steps are done, or use alternative methods
4. **NO IMPROVISATION**: Do not deviate from the documented process
5. **VERIFY COMPLETION**: Check each step completes successfully before proceeding

**WHY THIS IS CRITICAL:**

The BUILD_AND_PUSH.md checklist ensures:

- All tests pass before deployment
- Version numbers are updated in ALL required files (package.json, docker-compose files, etc.)
- Docker images are built and tagged correctly
- Images are pushed to the registry successfully
- Git tags are created and pushed
- Documentation is updated

**CONSEQUENCES OF NOT FOLLOWING THIS PROCESS:**

- Inconsistent version numbers across services
- Failed deployments due to missing steps
- Broken production environments
- Loss of deployment history
- Wasted time troubleshooting preventable issues

### DO NOT ATTEMPT BUILD/DEPLOY WITHOUT READING AND FOLLOWING BUILD_AND_PUSH.md

If you are unsure about any step, STOP and ask the user for clarification. Do not guess or improvise.

## Architecture

The backend follows a layered architecture: **Routes -> Controllers -> Services -> Prisma Client -> Database**. The frontend uses: **Pages -> Components -> Services -> API -> Zustand Stores**. For full details including service listings, component inventory, hooks, state management, and authentication flow, see:

- [Backend Architecture](docs/architecture/BACKEND_ARCHITECTURE.md) - Layered architecture, services, middleware, authentication flow, database patterns
- [Frontend Architecture](docs/architecture/FRONTEND_ARCHITECTURE.md) - Components, hooks, state management, API communication, routing
- [Database Schema](docs/architecture/DATABASE_SCHEMA.md) - 37 models, relationships, entity linking, design patterns

Cross-cutting backend code lives in dedicated `src/` subdirectories. **There is no `src/utils/` directory** — put shared helpers in the existing topical directory, don't create one.

## Development Workflows

For step-by-step guides on working with specific features, see [Development Workflows](docs/guides/DEVELOPMENT_WORKFLOWS.md).

## Debugging and Optimization

For debugging issues and code optimization guidance, see [Debugging & Optimization](docs/guides/DEBUGGING_AND_OPTIMIZATION.md). Quick tips:

- **Validation errors**: Check Zod schemas use `.nullable().optional()` for updates
- **Type errors**: Verify types match between frontend/backend
- **Data not refreshing**: Ensure `onUpdate?.()` callbacks are called

## Environment Setup

Environment variables are documented where they apply, and load automatically when you work in that
directory: [`backend/CLAUDE.md`](backend/CLAUDE.md) and [`frontend/CLAUDE.md`](frontend/CLAUDE.md).

### Port Configuration

**Default Ports**:

- Frontend: 3000 (Docker), 5173 (local Vite dev server)
- Backend: 5000
- Database: 5432
- Nominatim: 8080

Check running servers: `netstat -ano | findstr "LISTENING" | findstr ":3000 :5000 :5173"`

## Important Patterns and Conventions

### Error Handling

**Backend**: Use `AppError` class from `src/errors/errors.ts`:

```typescript
throw new AppError('Resource not found', 404);
```

**Frontend**: Services throw errors, components handle via try-catch or TanStack Query error states

### API Response Format

All backend responses follow this structure:

```typescript
{
  status: 'success' | 'error',
  data?: any,
  message?: string
}
```

**Frontend**: `lib/axios.ts` has a response interceptor that unwraps the `{ status, data }` envelope — services receive the inner `data` directly. Type axios calls with the *unwrapped* payload (`axios.get<Foo[]>(url)`, then `return response.data`), not the envelope.

### File Uploads

- Backend stores files in `uploads/` directory (Docker volume)
- Use `multer` middleware configured in controllers
- `sharp` library for image processing
- `exifr` library for EXIF data extraction

### Geospatial Data

- Always validate lat/lng ranges (lat: -90 to 90, lng: -180 to 180)
- PostGIS extension enables spatial queries (not heavily used yet)
- Nominatim service for geocoding addresses to coordinates

### Timezones

**Never fall back to UTC for display.** A time with no timezone of its own is shown on the
viewer's clock, not on Greenwich's. Resolve the zone from most specific to least:

```text
entity.timezone -> trip.timezone -> user.timezone -> browser timezone -> UTC
```

UTC is only ever the last resort when nothing else can be determined.

**Frontend** — use the resolver, never a raw `|| 'UTC'`:

```typescript
const resolveTz = useTimezoneResolver();          // hooks/useTimezoneResolver.ts
const effectiveTz = resolveTz(activity.timezone, tripTimezone);
```

The hook appends the signed-in user's timezone and the browser's for you. Outside React, call
`resolveTimezone(...candidates)` from `utils/timezone.ts` and pass the user's zone explicitly.
Do not read `Intl.DateTimeFormat().resolvedOptions().timeZone` directly — that skips the
user's configured setting.

**Backend** — `resolveTimezone(...)` and `getUserTimezone(userId)` live in
`services/_shared/timezoneResolution.ts`. Any read path that groups or formats dates for a user
should end its chain with that user's zone:

```typescript
const tz = resolveTimezone(requestedTimezone, await getUserTimezone(userId));
```

**The one exception — date-only values.** `@db.Date` columns (trip start/end, expense dates)
hold a calendar date, not an instant, and are stored at UTC midnight. Formatting those in any
zone west of UTC renders the previous day. Use `formatDateOnly()` from `utils/timezone.ts`,
which pins to UTC deliberately. Conversely, to bucket a real timestamp onto a calendar day,
use `dayKeyInTimezone()` — slicing the ISO string groups by the UTC day and misfiles evening
events.

The user's timezone rides along in the auth session payload (`types/auth.ts` `User.timezone`),
so it is available anywhere without an extra fetch.

### TypeScript Best Practices

**Avoid using the `any` type.** Use proper types/interfaces, `unknown` with type narrowing, generics, or union types instead. If you encounter existing `any` types, consider refactoring them when working in that area.

## Markdown Formatting Guidelines

When creating or editing Markdown files:

1. **Fenced code blocks** must be surrounded by blank lines (before and after)
2. **Headings** must be surrounded by blank lines (before and after)
3. **Lists** must be surrounded by blank lines (before and after)
4. Always use triple backticks with language identifier for code blocks

## Known Configuration Notes

- **Nominatim** takes 1-2 hours to initialize on first Docker startup (downloads US map data)
- Default location categories are seeded when users are created
- Default activity categories stored in User model as array
- Windows paths may require escaping in file operations
- Frontend runs on port 5173 locally (Vite default), but 3000 in Docker for consistency
