# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Important References:**

All documentation is organized in the `docs/` folder. Start with the [Documentation Index](docs/README.md) for navigation.

## Quick Reference

| Need | Document |
| ---- | -------- |
| **Understand the codebase** | [Backend Architecture](docs/architecture/BACKEND_ARCHITECTURE.md), [Frontend Architecture](docs/architecture/FRONTEND_ARCHITECTURE.md) |
| **Work on the UI** | [Style Guide](docs/architecture/STYLE_GUIDE.md) (**required reading**) |
| **Understand the database** | [Database Schema](docs/architecture/DATABASE_SCHEMA.md) |
| **Use the API** | [API Reference](docs/api/README.md) |
| **Deploy to production** | [Deployment Guide](DEPLOYMENT.md), [Quick Start](QUICK_START_PRODUCTION.md) |
| **Release a new version** | [Build & Push](docs/guides/BUILD_AND_PUSH.md), [Release Checklist](RELEASE_CHECKLIST.md) |
| **Track progress** | [Implementation Status](docs/development/IMPLEMENTATION_STATUS.md) |
| **Development workflows** | [Development Workflows](docs/guides/DEVELOPMENT_WORKFLOWS.md) |
| **Debug issues** | [Debugging & Optimization](docs/guides/DEBUGGING_AND_OPTIMIZATION.md), [Debugger Agent](.agents/DEBUGGER.md) |
| **Optimize code** | [Debugging & Optimization](docs/guides/DEBUGGING_AND_OPTIMIZATION.md), [Code Optimizer Agent](.agents/CODE_OPTIMIZER.md) |

## Documentation Index

- **Architecture**: [Backend](docs/architecture/BACKEND_ARCHITECTURE.md), [Frontend](docs/architecture/FRONTEND_ARCHITECTURE.md), [Database Schema](docs/architecture/DATABASE_SCHEMA.md), [Style Guide](docs/architecture/STYLE_GUIDE.md), [Optimization Plan](docs/architecture/BACKEND_OPTIMIZATION_PLAN.md)
- **API**: [Complete API Reference](docs/api/README.md)
- **Development**: [Implementation Status](docs/development/IMPLEMENTATION_STATUS.md), [Feature Backlog](docs/development/FEATURE_BACKLOG.md), [UI/UX Plan](docs/development/UI_UX_IMPROVEMENT_PLAN.md), [Bugs](docs/development/BUGS.md)
- **Guides**: [Build & Push](docs/guides/BUILD_AND_PUSH.md), [Development Workflows](docs/guides/DEVELOPMENT_WORKFLOWS.md), [Debugging & Optimization](docs/guides/DEBUGGING_AND_OPTIMIZATION.md), [Testing](docs/guides/TESTING_GUIDE.md), [Routing Setup](docs/guides/ROUTING_SETUP.md)
- **Plans**: [Google Maps](docs/plans/GOOGLE_MAPS_INTEGRATION_PLAN.md), [Google Photos](docs/plans/GOOGLE_PHOTOS_INTEGRATION_PLAN.md), [UI Improvements](docs/plans/UI_IMPROVEMENTS.md), [Trip Dashboard](docs/plans/TRIP_DASHBOARD_PLAN.md)
- **User Guide**: [End-user documentation](docs/user-guide/README.md)
- **Agents**: [Debugger](.agents/DEBUGGER.md), [Code Optimizer](.agents/CODE_OPTIMIZER.md)
- **Root**: [Deployment](DEPLOYMENT.md), [Quick Start Production](QUICK_START_PRODUCTION.md), [Release Checklist](RELEASE_CHECKLIST.md), [README](README.md)

## Project Overview

Travel Life is a full-stack travel documentation application built with a React frontend and Express backend. The application enables users to track trips with rich features including locations, photos, transportation, lodging, journal entries, and more.

### Current Implementation Status

**The application is ~92% complete and production-ready for personal use.** See [Implementation Status](docs/development/IMPLEMENTATION_STATUS.md) for detailed progress and [Feature Backlog](docs/development/FEATURE_BACKLOG.md) for future enhancements.

**Core Features (100% Complete)**: Authentication, Trip Management, Locations, Photos (local + Immich), Transportation, Lodging, Activities, Journal Entries, Tags & Companions, Entity Linking, Timeline View, User Settings, Dark Mode, Checklists, Trip Health Check, Trip Collaboration, Backup & Restore, Advanced Dashboard, Global Search, Places Visited Map, Calendar View, Batch Operations, Auto-Save Drafts, Weather Integration, Flight Tracking.

**Still in Progress**: Public trip sharing, Google Photos integration, PDF export, Offline support / PWA, Mobile app.

## Tech Stack

**Backend**: Node.js + Express + TypeScript + PostgreSQL (PostGIS) + Prisma ORM + JWT Authentication
**Frontend**: React + TypeScript + Vite + Tailwind CSS + TanStack Query + Zustand + Leaflet
**Infrastructure**: Docker Compose with self-hosted Nominatim for geocoding

## Development Commands

### Backend (run from `backend/` directory)

- `npm run dev` - Start development server with hot reload (tsx watch)
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run production build
- `npm test` - Run Jest tests
- `npm run prisma:generate` - Generate Prisma Client after schema changes
- `npm run prisma:migrate` - Create and run a new migration
- `npm run prisma:studio` - Open Prisma Studio GUI at `http://localhost:5555`

### Frontend (run from `frontend/` directory)

- `npm run dev` - Start Vite dev server (typically runs on port 5173 locally, 3000 in Docker)
- `npm run build` - Build production bundle (runs TypeScript compiler first)
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

### Docker Commands (run from project root)

**Development:**

- `docker-compose up -d` - Start all services (db, backend, frontend, nominatim)
- `docker-compose down` - Stop all services
- `docker ps` - Check running containers
- `docker logs travel-life-backend` - View backend logs
- `docker logs travel-life-frontend` - View frontend logs
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
- [Database Schema](docs/architecture/DATABASE_SCHEMA.md) - 21 tables, relationships, entity linking, design patterns

## Development Workflows

For step-by-step guides on working with specific features, see [Development Workflows](docs/guides/DEVELOPMENT_WORKFLOWS.md). Covers:

- Adding a new feature (full stack)
- Working with UI Components and the Style Guide
- Database changes and migrations
- Authentication (backend routes + frontend state)
- Entity Linking (backend API + frontend components)
- Timeline and Printable Itinerary
- Album Pagination (paged, not infinite scroll)
- Checklists, Trip Health Check, Backup & Restore
- Trip Collaboration, Global Search, Batch Operations, Auto-Save Drafts

## Debugging and Optimization

For debugging issues and code optimization guidance, see [Debugging & Optimization](docs/guides/DEBUGGING_AND_OPTIMIZATION.md). Quick tips:

- **Validation errors**: Check Zod schemas use `.nullable().optional()` for updates
- **Type errors**: Verify types match between frontend/backend
- **Data not refreshing**: Ensure `onUpdate?.()` callbacks are called
- Use the [Debugger Agent](.agents/DEBUGGER.md) for systematic bug investigation
- Use the [Code Optimizer Agent](.agents/CODE_OPTIMIZER.md) for reducing duplication (Rule of Three)

## Environment Setup

### Required Environment Variables

**Backend** (`.env` file in `backend/`):

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/travel_life?schema=public
JWT_SECRET=<strong-secret>
JWT_REFRESH_SECRET=<strong-secret>
NOMINATIM_URL=http://localhost:8080
```

**Recommended Backend Variables**:

- `OPENROUTESERVICE_API_KEY` - **For accurate road distance calculations (car/bike/walking)**. Without this, distances fall back to straight-line (Haversine) calculations. See [ROUTING_SETUP.md](docs/guides/ROUTING_SETUP.md)

**Optional Backend Variables**:

- `IMMICH_API_URL` and `IMMICH_API_KEY` - For Immich integration
- `OPENWEATHERMAP_API_KEY` - For weather data
- `AVIATIONSTACK_API_KEY` - For flight tracking

**Frontend** (`.env` file in `frontend/`):

```bash
VITE_API_URL=http://localhost:5000/api
VITE_UPLOAD_URL=http://localhost:5000/uploads
```

### Port Configuration

**Default Ports**:

- Frontend: 3000 (Docker), 5173 (local Vite dev server)
- Backend: 5000
- Database: 5432
- Nominatim: 8080

Check running servers: `netstat -ano | findstr "LISTENING" | findstr ":3000 :5000 :5173"`

## Important Patterns and Conventions

### Error Handling

**Backend**: Use `AppError` class from `src/utils/errors.ts`:

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

### File Uploads

- Backend stores files in `uploads/` directory (Docker volume)
- Use `multer` middleware configured in controllers
- `sharp` library for image processing
- `exifr` library for EXIF data extraction

### Geospatial Data

- Always validate lat/lng ranges (lat: -90 to 90, lng: -180 to 180)
- PostGIS extension enables spatial queries (not heavily used yet)
- Nominatim service for geocoding addresses to coordinates

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
