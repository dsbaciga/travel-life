# Backend Architecture

This document provides a comprehensive overview of Travel Life backend architecture, patterns, conventions, and best practices.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Directory Structure](#directory-structure)
3. [Layered Architecture](#layered-architecture)
4. [Database Layer](#database-layer)
5. [API Design](#api-design)
6. [Authentication & Authorization](#authentication--authorization)
7. [Error Handling](#error-handling)
8. [Validation](#validation)
9. [Configuration](#configuration)
10. [File Uploads](#file-uploads)
11. [External Integrations](#external-integrations)
12. [Common Patterns](#common-patterns)
13. [Code Patterns and Utilities](#code-patterns-and-utilities)
14. [Best Practices](#best-practices)

---

## Architecture Overview

The backend follows a **layered architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────┐
│          HTTP Request (Express)                     │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│      Middleware (Auth, CORS, etc)                   │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│              Routes Layer                           │
│  - Define endpoints                                 │
│  - Apply route-specific middleware                  │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│           Controllers Layer                         │
│  - Request/Response handling                        │
│  - Input validation (Zod)                           │
│  - Extract user from req.user                       │
│  - Call service methods                             │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│            Services Layer                           │
│  - Business logic                                   │
│  - Database operations via Prisma                   │
│  - Authorization checks                             │
│  - External API calls                               │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│          Database (PostgreSQL)                      │
│  - Accessed via Prisma ORM                          │
│  - PostGIS extension for geospatial                 │
└─────────────────────────────────────────────────────┘
```

### Key Principles

- **Single Responsibility**: Each layer has one clear purpose
- **Dependency Injection**: Services are instantiated as singletons and exported
- **Type Safety**: TypeScript throughout with strict mode
- **Validation**: Zod schemas for all inputs at controller level
- **Error Handling**: Centralized error handler middleware
- **Separation**: Business logic in services, HTTP concerns in controllers

### Stack

Node 26, Express 4, TypeScript 5, Prisma 7 (`@prisma/adapter-pg`), Zod 4, PostgreSQL + PostGIS, JWT (`jsonwebtoken`, HS256), `bcrypt`, `helmet`, `express-rate-limit`, `multer`, `sharp`, `winston`.

### Global Middleware Order (`src/index.ts`)

`trust proxy` -> `helmet` -> `cors` -> rate limiters (`/api/auth/*` limiters, then general `/api` limiter) -> body parsers (1 MB JSON, 100 MB on `/api/backup`) -> `cookie-parser` -> CSRF validation (`security/csrf.ts`, on `/api`) -> routes -> `errorHandler`. Uploaded files under `/uploads` are served only after file-access authentication and authorization checks.

---

## Directory Structure

```text
backend/
  prisma/
    schema.prisma                # Prisma database schema
    migrations/                  # Database migrations
  src/
    config/
      index.ts                   # Central configuration (throws if secrets missing or weak)
      database.ts                # Prisma client (pg driver adapter + PostGIS extension)
      prismaExtensions.ts        # PostGIS extension (syncs GEOGRAPHY columns from lat/lng)
      logger.ts                  # Winston logger setup
      cron.ts                    # Cron job initialisation
      swagger.ts                 # OpenAPI / Swagger setup
    controllers/
      auth.controller.ts
      trip.controller.ts
      location.controller.ts
      ...                        # One controller per resource
    services/
      auth.service.ts
      trip.service.ts
      photo.service.ts
      ...                        # Business logic layer (~65 services)
      _shared/
        tripAccess.ts            # Trip/entity access verification
        tripPermissions.ts       # Permission levels, hierarchy, validation
        prismaUpdateData.ts      # Conditional update-data builder + transformers
        decimalConversion.ts     # Prisma Decimal -> number conversion
        timezoneResolution.ts    # Server-side timezone resolution
        entityLinkCleanup.ts     # EntityLink removal on entity delete
        tripListOrder.ts         # Trip list sorting / current-trip ranking
        vendored/                # Pure helpers shared with the mobile app
          geo.ts                 #   Geo math, track normalisation, stop detection
          nearbyFood.ts          #   Dietary matching + nearby-food types
          receiptParser.ts       #   Receipt text parsing
    routes/
      auth.routes.ts
      trip.routes.ts
      ...                        # One route file per resource
    middleware/
      auth.ts                    # JWT authentication (async, blacklist + passwordVersion check)
      errorHandler.ts            # Global error handling
      rateLimit.ts               # Rate limiters (general, auth, AI, backup, per-user keyed)
    auth/
      jwt.ts                     # JWT token utilities
      password.ts                # Password hashing
      controllerHelpers.ts       # requireUserId() and related helpers
      clientPlatform.ts          # Detects the native companion app (body-delivered refresh tokens)
    http/
      asyncHandler.ts            # Async error wrapper
      parseId.ts                 # Safe integer route-param parsing
      cookies.ts                 # Cookie helpers (refresh token storage)
      mobileSignInPages.ts       # Server-rendered pages for the mobile SSO hand-off
    errors/
      errors.ts                  # AppError class
    prisma/
      crudHelpers.ts             # Generic CRUD helpers
      modelDelegates.ts          # Prisma model delegate typing helpers (used by crudHelpers)
      prismaIncludes.ts          # Shared Prisma include/select patterns
    security/
      csrf.ts                    # CSRF protection
      encryption.ts              # AES-256 at-rest encryption for stored API keys / SMTP passwords
      urlValidation.ts           # URL validation / SSRF guards
      integrationRequestGuard.ts # Request-time SSRF guard (DNS rebinding) for user-configured URLs
      promptSafety.ts            # LLM prompt safety checks
    validation/
      zodHelpers.ts              # Shared Zod schema helpers
      share.ts                   # Share-token format validation
    types/
      auth.types.ts
      trip.types.ts
      ...                        # Zod schemas + TypeScript types
    constants/
      dietaryTags.ts             # Shared constants
    data/
      checklist-defaults.ts      # Seed data (checklists)
      airports.ts                # Airport seed data
      language-phrases*.ts       # Language phrase seed data (several files)
    index.ts                     # Express app entry point
  uploads/                       # File upload storage (Docker volume)
  package.json
  tsconfig.json
  .env                           # Environment variables
```

---

## Layered Architecture

### 1. Routes Layer (`src/routes/`)

**Purpose**: Define API endpoints and apply middleware

**Pattern**:
```typescript
import express from 'express';
import { authenticate } from '../middleware/auth';
import { tripController } from '../controllers/trip.controller';

const router = express.Router();

// Protected routes (auth required)
router.use(authenticate); // Apply to all routes below

router.post('/', tripController.createTrip);
router.get('/', tripController.getTrips);
router.get('/:id', tripController.getTripById);
router.put('/:id', tripController.updateTrip);
router.delete('/:id', tripController.deleteTrip);

export default router;
```

**Key Points**:
- Use Express Router
- Apply `authenticate` middleware to protected routes
- Keep routes thin - no business logic
- Controllers are exported as named object literals (e.g. `tripController`)
- Export the router as default and register in `src/index.ts`

### 2. Controllers Layer (`src/controllers/`)

**Purpose**: Handle HTTP requests/responses and validate input

**Pattern**: Controllers are plain object literals whose methods are wrapped in
`asyncHandler`. There are no `try`/`catch` blocks or `next(error)` calls —
`asyncHandler` forwards any thrown error to the centralized error handler.

```typescript
import { Request, Response } from 'express';
import tripService from '../services/trip.service';
import { createTripSchema, updateTripSchema } from '../types/trip.types';
import logger from '../config/logger';
import { parseId } from '../http/parseId';
import { asyncHandler } from '../http/asyncHandler';
import { requireUserId } from '../auth/controllerHelpers';

export const tripController = {
  createTrip: asyncHandler(async (req: Request, res: Response) => {
    // 1. Extract and verify the authenticated user (throws 401 if missing)
    const userId = requireUserId(req);

    // 2. Validate input with Zod
    const validatedData = createTripSchema.parse(req.body);

    // 3. Call service
    const trip = await tripService.createTrip(userId, validatedData);

    // 4. Log success
    logger.info(`Trip created: ${trip.id} by user ${userId}`);

    // 5. Return success response
    res.status(201).json({
      status: 'success',
      data: trip,
    });
  }),

  updateTrip: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.id, 'tripId');
    const validatedData = updateTripSchema.parse(req.body);

    const trip = await tripService.updateTrip(userId, tripId, validatedData);

    logger.info(`Trip updated: ${trip.id} by user ${userId}`);

    res.status(200).json({
      status: 'success',
      data: trip,
    });
  }),
};
```

**Key Points**:
- Wrap every controller method in `asyncHandler` — no `try`/`catch` or `next(error)`
- Use `requireUserId(req)` from `../auth/controllerHelpers` for protected endpoints (throws 401 if not authenticated)
- Validate ALL inputs with Zod schemas
- Parse URL parameters with `parseId(req.params.id, 'name')` from `../http/parseId`
- Call service methods with userId for authorization
- Use the standard response format
- Export a named object literal (e.g. `export const tripController = { ... }`)

### 3. Services Layer (`src/services/`)

**Purpose**: Business logic and database operations

**Pattern**:
```typescript
import prisma from '../config/database';
import { AppError } from '../errors/errors';
import { CreateTripInput, UpdateTripInput } from '../types/trip.types';

export class TripService {
  async createTrip(userId: number, data: CreateTripInput) {
    // Business logic
    const timezone = data.timezone || await this.getUserTimezone(userId);

    // Database operation
    const trip = await prisma.trip.create({
      data: {
        userId,
        title: data.title,
        description: data.description,
        timezone,
        status: data.status,
        privacyLevel: data.privacyLevel,
      },
    });

    return trip;
  }

  async getTripById(userId: number, tripId: number) {
    // Query with authorization check
    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { userId }, // Owner
          { collaborators: { some: { userId } } }, // Collaborator
          { privacyLevel: 'Public' }, // Public
        ],
      },
      include: {
        coverPhoto: true,
        tagAssignments: {
          include: { tag: true },
        },
      },
    });

    if (!trip) {
      throw new AppError('Trip not found', 404);
    }

    return trip;
  }

  async updateTrip(userId: number, tripId: number, data: UpdateTripInput) {
    // Verify ownership
    const existingTrip = await prisma.trip.findFirst({
      where: { id: tripId, userId },
    });

    if (!existingTrip) {
      throw new AppError(
        'Trip not found or you do not have permission to edit it',
        404
      );
    }

    // Build update object (only include defined fields)
    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    // ... other fields

    // Update
    const trip = await prisma.trip.update({
      where: { id: tripId },
      data: updateData,
    });

    return trip;
  }

  async deleteTrip(userId: number, tripId: number) {
    // Verify ownership
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, userId },
    });

    if (!trip) {
      throw new AppError(
        'Trip not found or you do not have permission to delete it',
        404
      );
    }

    // Delete (cascades will handle related records)
    await prisma.trip.delete({
      where: { id: tripId },
    });

    return { message: 'Trip deleted successfully' };
  }

  private async getUserTimezone(userId: number): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    return user?.timezone || 'UTC'; // simplified; real code uses resolveTimezone(...) from _shared/timezoneResolution
  }
}

export default new TripService();
```

**Key Points**:
- All methods take `userId` as first parameter for authorization
- Verify ownership/permissions before updates/deletes
- Use `AppError` for business logic errors
- Build update objects conditionally (only defined fields)
- Use Prisma's `include` for related data
- Use Prisma's `select` to fetch only needed fields
- Export singleton instance

### Shared Service Modules (`src/services/_shared/`)

**Purpose**: Reduce code duplication across services by providing common authorization and validation patterns

Each module under `_shared/` is named for a single domain concern, eliminating 40+ instances of duplicated authorization code across the codebase. Import from the specific module you depend on — there is no barrel file.

**Available Helpers**:

Authorization and access verification (`_shared/tripAccess.ts`):

1. **`verifyEntityInTrip(entityType, entityId, tripId): Promise<void>`**
   - Verifies an entity exists and belongs to a specific trip
   - Throws `AppError` 404 if not found or doesn't belong to the trip
   - Use when validating a foreign-key id (e.g. `locationId`) in create/update methods

2. **`verifyEntityAccessById<T>(entityType, entityId, userId): Promise<T>`**
   - Combined find + ownership check: verifies the entity exists and the user owns its trip
   - Throws `AppError` 404 if not found or access denied
   - Returns the entity

3. **`verifyTripAccess(userId, tripId)`** *(deprecated — prefer `verifyTripAccessWithPermission`)*
   - Verifies the user owns the trip; throws `AppError` 404 otherwise; returns the trip

4. **`verifyEntityAccess<T>(entity, userId, entityName): Promise<T>`** *(deprecated)*
   - Verifies an already-loaded entity (with `trip` included) belongs to the user
   - Throws `AppError` 404 if entity is null, 403 if access denied; returns the entity

5. **`verifyEntityAccessWithPermission<T>(entityType, entityId, userId, requiredPermission?)`**
   - Permission-aware entity access supporting owners, collaborators, and public trips
   - Returns `{ entity, tripAccess }`

6. **`verifyTripAccessWithPermission(userId, tripId, requiredPermission?)`**
   - Permission-aware trip access supporting owners, collaborators, and public trips
   - Returns a `TripAccessResult` with `isOwner` and `permissionLevel`

7. **`verifyEntityOwnership<T>(findQuery, userId, entityName): Promise<T>`** *(deprecated)*
   - Runs a custom find query then delegates to `verifyEntityAccess`

Permission-level helpers (`_shared/tripPermissions.ts`):

8. **`isValidPermissionLevel(value): value is TripPermissionLevel`** — type guard for `'view' | 'edit' | 'admin'`
9. **`toSafePermissionLevel(value, defaultLevel?)`** — validates a permission level, falling back to a default

Update-data builders (`_shared/prismaUpdateData.ts`):

10. **`buildConditionalUpdateData<T>(data, options?)`**
    - Builds update data with only defined fields, optional empty-string-to-null conversion and custom transformers

11. **`tripDateTransformer(dateStr)`** — converts a `YYYY-MM-DD` string (or null) to a UTC `Date`

Other modules:

12. **`convertDecimals<T>(obj): T`** (`_shared/decimalConversion.ts`) — recursively converts Prisma `Decimal` values to plain numbers for JSON responses
13. **`cleanupEntityLinks(tripId, entityType, entityId, tx?)`** (`_shared/entityLinkCleanup.ts`) — removes all `EntityLink` rows for an entity before deletion
14. **`resolveTimezone(...candidates)` / `getUserTimezone(userId)`** (`_shared/timezoneResolution.ts`) — `resolveTimezone` picks the first specified timezone (UTC only as the last resort); `getUserTimezone` returns the user's configured zone or `null`, so end the chain with it
15. **`compareTripsForList`, `tripGroupRank`, `isCurrentTrip`, …** (`_shared/tripListOrder.ts`) — trip list ordering and current-trip detection
16. **`_shared/vendored/`** (`geo.ts`, `nearbyFood.ts`, `receiptParser.ts`) — pure, dependency-free helpers kept identical to the copies used by the mobile companion app

**Usage Examples**:

**Before** (old pattern with duplication):
```typescript
async createActivity(userId: number, data: CreateActivityInput) {
  // Verify user owns the trip
  const trip = await prisma.trip.findFirst({
    where: { id: data.tripId, userId },
  });

  if (!trip) {
    throw new AppError('Trip not found or access denied', 404);
  }

  // Verify location belongs to trip if provided
  if (data.locationId) {
    const location = await prisma.location.findFirst({
      where: { id: data.locationId, tripId: data.tripId },
    });

    if (!location) {
      throw new AppError('Location not found or does not belong to trip', 404);
    }
  }

  // ... actual logic
}

async updateActivity(userId: number, activityId: number, data: UpdateActivityInput) {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: { trip: true },
  });

  if (!activity) {
    throw new AppError('Activity not found', 404);
  }

  if (activity.trip.userId !== userId) {
    throw new AppError('Access denied', 403);
  }

  // ... actual logic
}

async deleteActivity(userId: number, activityId: number) {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: { trip: true },
  });

  if (!activity) {
    throw new AppError('Activity not found', 404);
  }

  if (activity.trip.userId !== userId) {
    throw new AppError('Access denied', 403);
  }

  await prisma.activity.delete({ where: { id: activityId } });
}
```

**After** (using helpers):
```typescript
import {
  verifyTripAccess,
  verifyEntityAccessById,
  verifyEntityInTrip,
} from './_shared/tripAccess';

async createActivity(userId: number, data: CreateActivityInput) {
  // Verify user owns the trip
  await verifyTripAccess(userId, data.tripId);

  // Verify location belongs to trip if provided
  if (data.locationId) {
    await verifyEntityInTrip('location', data.locationId, data.tripId);
  }

  // ... actual logic
}

async updateActivity(userId: number, activityId: number, data: UpdateActivityInput) {
  // Combined find + ownership check
  await verifyEntityAccessById('activity', activityId, userId);

  // ... actual logic
}

async deleteActivity(userId: number, activityId: number) {
  await verifyEntityAccessById('activity', activityId, userId);

  await prisma.activity.delete({ where: { id: activityId } });
}
```

**Benefits**:

- **Reduced Duplication**: Eliminates 10-15 lines of boilerplate per service method
- **Consistency**: Same authorization logic across all services
- **Maintainability**: Changes to authorization patterns in one place
- **Type Safety**: `verifyEntityAccess` returns non-null entity
- **Better Error Messages**: Standardized error responses

**Services Using Helpers**:

- ✅ `activity.service.ts`
- ✅ `lodging.service.ts`
- ✅ `transportation.service.ts`
- ✅ `journalEntry.service.ts`
- ✅ `photoAlbum.service.ts`
- ✅ `location.service.ts`
- ✅ `weather.service.ts`
- ✅ `photo.service.ts`
- ✅ `companion.service.ts`
- ✅ `tag.service.ts`

---

## Database Layer

### Prisma ORM

**Prisma Client** (Prisma 7): Instantiated in `src/config/database.ts` with the `@prisma/adapter-pg` driver adapter over a `pg` connection pool, then extended with the PostGIS extension from `config/prismaExtensions.ts`. Also exports `checkDatabaseConnection()` (retrying startup check).

```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { postgisExtension } from './prismaExtensions';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prismaClient = new PrismaClient({ adapter: new PrismaPg(pool) });
const prisma = prismaClient.$extends(postgisExtension);

export default prisma;
```

### Schema Patterns

**Key Conventions**:
- Snake_case for database columns (`@map("column_name")`)
- CamelCase for Prisma model fields
- Explicit `@id`, `@default`, `@map` directives
- `createdAt` and `updatedAt` timestamps
- Foreign keys with `onDelete: Cascade` or `SetNull`

**Example Model**:
```prisma
model Trip {
  id                  Int      @id @default(autoincrement())
  userId              Int      @map("user_id")
  title               String   @db.VarChar(500)
  description         String?  @db.Text
  startDate           DateTime? @map("start_date") @db.Date
  status              String   @db.VarChar(50)
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  user               User                   @relation(fields: [userId], references: [id], onDelete: Cascade)
  locations          Location[]
  photos             Photo[]

  @@map("trips")
}
```

### Common Query Patterns

**Find by ID with authorization**:
```typescript
const trip = await prisma.trip.findFirst({
  where: {
    id: tripId,
    OR: [
      { userId },
      { collaborators: { some: { userId } } },
    ],
  },
});
```

**Pagination**:
```typescript
const page = parseInt(query.page || '1');
const limit = parseInt(query.limit || '10');
const skip = (page - 1) * limit;

const [items, total] = await Promise.all([
  prisma.trip.findMany({
    where,
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' },
  }),
  prisma.trip.count({ where }),
]);

return {
  items,
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
};
```

**Conditional filtering**:
```typescript
const where: any = { userId };

if (query.status) {
  where.status = query.status;
}

if (query.search) {
  where.OR = [
    { title: { contains: query.search, mode: 'insensitive' } },
    { description: { contains: query.search, mode: 'insensitive' } },
  ];
}

const trips = await prisma.trip.findMany({ where });
```

**Update with conditional fields**:
```typescript
const updateData: any = {};
if (data.title !== undefined) updateData.title = data.title;
if (data.description !== undefined) updateData.description = data.description;
// Only include fields that are provided

const updated = await prisma.trip.update({
  where: { id: tripId },
  data: updateData,
});
```

### Migrations

**Create migration**:
```bash
cd backend
npx prisma migrate dev --name descriptive_migration_name
```

**Apply migrations (production)**:
```bash
npx prisma migrate deploy
```

**Generate Prisma Client** (after schema changes):
```bash
npx prisma generate
```

**IMPORTANT**: Never edit migration files manually. Always create new migrations for schema changes.

---

## API Design

### Standard Response Format

All API responses follow this structure:

**Success Response**:
```typescript
{
  status: 'success',
  data: {
    // Response data here
  }
}
```

**Error Response**:
```typescript
{
  status: 'error',
  message: 'Error description',
  fields?: ['fieldName'] // For validation errors: names of the invalid fields
}
```

### HTTP Status Codes

- `200 OK` - Successful GET, PUT, DELETE
- `201 Created` - Successful POST
- `400 Bad Request` - Validation error, Prisma constraint violation
- `401 Unauthorized` - Missing or invalid token
- `403 Forbidden` - Authenticated but not authorized
- `404 Not Found` - Resource doesn't exist
- `500 Internal Server Error` - Unexpected errors

### RESTful Conventions

```
GET    /api/trips          - List trips (with pagination)
POST   /api/trips          - Create trip
GET    /api/trips/:id      - Get trip by ID
PUT    /api/trips/:id      - Update trip
DELETE /api/trips/:id      - Delete trip

GET    /api/trips/:id/locations  - List locations for trip
POST   /api/locations              - Create location (tripId in body)
PUT    /api/locations/:id          - Update location
DELETE /api/locations/:id          - Delete location
```

---

## Authentication & Authorization

### JWT Token Flow

1. **Registration/Login**: User provides credentials
2. **Token Generation**: Server generates access + refresh tokens
3. **Client Storage**: Frontend stores tokens (localStorage/memory)
4. **Request Authentication**: Client sends access token in header
5. **Token Verification**: Middleware verifies token
6. **Token Refresh**: When access token expires, use refresh token

### Authentication Middleware

**File**: `src/middleware/auth.ts`

The real `authenticate` middleware is **async**. In addition to verifying the
token signature, it checks a token blacklist (revoked on logout) and compares
the token's `passwordVersion` against the user's current `passwordVersion`
(rejecting tokens issued before a password change). A short-TTL (60s), size-capped
in-memory LRU cache avoids a DB query on every request. The file also exports
`resolveCurrentPasswordVersion(userId)` (shared with the `/uploads` file-access
check in `index.ts`), `invalidatePasswordVersionCache(userId)` and
`clearPasswordVersionCache()` (tests). The example below omits the cache for brevity.

```typescript
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../auth/jwt';
import { AppError } from './errorHandler'; // re-exported from ../errors/errors
import { JwtPayload } from '../types/auth.types';
import prisma from '../config/database';
import { isBlacklisted } from '../services/tokenBlacklist.service';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const decoded = verifyAccessToken(token);

    // Reject revoked tokens (e.g. after logout)
    if (isBlacklisted(token)) {
      throw new AppError('Token has been revoked', 401);
    }

    // Reject tokens issued before a password change (real code: cached lookup)
    const tokenPwVersion = decoded.passwordVersion ?? 0;
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { passwordVersion: true },
    });
    if (!user || (user.passwordVersion ?? 0) !== tokenPwVersion) {
      throw new AppError('Token invalidated. Please log in again.', 401);
    }

    req.user = decoded; // Attach user to request

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError('Invalid or expired token', 401));
    }
  }
};
```

### JWT Utilities

**File**: `src/auth/jwt.ts`

Tokens are HS256. The payload is `JwtPayload` from `types/auth.types.ts`
(`id`, `userId`, `email`, optional `passwordVersion`). Verification pins
`algorithms: ['HS256']` and validates the claim shapes rather than casting.
Refresh tokens carry a unique `jti` and are single-use (the consumed token is
blacklisted via `tokenBlacklist.service`).

```typescript
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { JwtPayload } from '../types/auth.types';

export const generateAccessToken = (payload: JwtPayload): string =>
  jwt.sign(payload, config.jwt.secret, accessSignOptions()); // 15m default

export const generateRefreshToken = (payload: JwtPayload): string =>
  jwt.sign({ ...payload, jti: randomUUID() }, config.jwt.refreshSecret, refreshSignOptions()); // 7d default

export const verifyAccessToken = (token: string): VerifiedJwtPayload =>
  toJwtPayload(jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] }));

export const verifyRefreshToken = (token: string): VerifiedJwtPayload =>
  toJwtPayload(jwt.verify(token, config.jwt.refreshSecret, { algorithms: ['HS256'] }));
```

### Authorization Patterns

**Ownership Check**:
```typescript
const trip = await prisma.trip.findFirst({
  where: { id: tripId, userId },
});

if (!trip) {
  throw new AppError('Trip not found or unauthorized', 404);
}
```

**Collaborator Check**:
```typescript
const trip = await prisma.trip.findFirst({
  where: {
    id: tripId,
    OR: [
      { userId }, // Owner
      { collaborators: { some: { userId } } }, // Collaborator
    ],
  },
});
```

**Public + Authorized Check**:
```typescript
const trip = await prisma.trip.findFirst({
  where: {
    id: tripId,
    OR: [
      { userId }, // Owner
      { collaborators: { some: { userId } } }, // Collaborator
      { privacyLevel: 'Public' }, // Public
    ],
  },
});
```

---

## Error Handling

### AppError Class

**File**: `src/errors/errors.ts`

```typescript
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}
```

**Usage**:
```typescript
throw new AppError('Trip not found', 404);
throw new AppError('Invalid credentials', 401);
throw new AppError('Permission denied', 403);
```

### Error Handler Middleware

**File**: `src/middleware/errorHandler.ts`

Abridged (the real file also redacts sensitive fields before logging the body in development, and falls back to any error with `isOperational` and a valid `statusCode`):

```typescript
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import logger from '../config/logger';
import { AppError } from '../errors/errors';
import { isPrismaError } from '../types/prisma-helpers';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Log all errors (body only in development, sensitive fields redacted)
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  // Zod validation errors - field names only, not schema details (Zod 4: err.issues)
  if (err instanceof ZodError) {
    const fieldNames = err.issues.map(e => e.path.join('.')).filter(Boolean);
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      fields: fieldNames.length > 0 ? fieldNames : undefined,
    });
  }

  // Prisma errors
  if (isPrismaError(err)) {
    // P2002: Unique constraint violation
    if (err.code === 'P2002') {
      return res.status(400).json({
        status: 'error',
        message: 'A record with this value already exists',
        field: getConstraintTarget(err.meta),
      });
    }

    // P2003: Foreign key constraint
    if (err.code === 'P2003') {
      return res.status(400).json({
        status: 'error',
        message: 'Referenced record does not exist',
      });
    }

    // P2025: Record not found
    if (err.code === 'P2025') {
      return res.status(404).json({
        status: 'error',
        message: 'Record not found',
      });
    }
  }

  // AppError (operational errors)
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  }

  // Unknown errors (programming errors)
  return res.status(500).json({
    status: 'error',
    message: 'Internal server error',
  });
};
```

**Key Points**:
- Handles Zod validation errors (400 with a `fields` list)
- Handles Prisma errors (P2002, P2003, P2025)
- Handles operational errors (AppError)
- Logs all errors with context
- Never exposes stack traces to client in production

---

## Validation

### Zod Schemas

**File**: `src/types/trip.types.ts`

```typescript
import { z } from 'zod';

// Create schema
export const createTripSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  timezone: z.string().max(100).optional(),
  status: z.enum(['Dream', 'Planning', 'Planned', 'In Progress', 'Completed', 'Cancelled']),
  privacyLevel: z.enum(['Private', 'Shared', 'Public']),
});

// Update schema (nullable + optional for clearable fields)
export const updateTripSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  timezone: z.string().max(100).nullable().optional(),
  status: z.enum(['Dream', 'Planning', 'Planned', 'In Progress', 'Completed', 'Cancelled']).optional(),
  privacyLevel: z.enum(['Private', 'Shared', 'Public']).optional(),
});

// TypeScript types
export type CreateTripInput = z.infer<typeof createTripSchema>;
export type UpdateTripInput = z.infer<typeof updateTripSchema>;
```

### Validation Pattern

**In Controllers** (inside an `asyncHandler`-wrapped method; a `ZodError` propagates to the error handler):
```typescript
const validatedData = createTripSchema.parse(req.body);
// Use validatedData (type-safe)
```

The backend uses **Zod 4**. Shared schema helpers live in `src/validation/zodHelpers.ts`.

### Important: Nullable vs Optional

- **`.optional()`**: Field can be omitted from request (undefined)
- **`.nullable()`**: Field can be set to null
- **`.nullable().optional()`**: Field can be omitted OR set to null (for updates where you want to clear values)

**Example**:
```typescript
// For creates (omit optional fields)
const createSchema = z.object({
  name: z.string(),
  description: z.string().optional(), // Can omit
});

// For updates (can clear fields)
const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(), // Can omit or set to null
});
```

---

## Configuration

### Central Configuration

**File**: `src/config/index.ts`

The config module **fails fast**: it throws on startup if `JWT_SECRET`,
`JWT_REFRESH_SECRET`, or `DATABASE_URL` are missing. There are no insecure
default fallbacks for secrets. The JWT secrets must also be at least 32
characters and not a well-known placeholder (enforced outside `NODE_ENV=test`).
`TRUST_PROXY` and `COOKIE_SAME_SITE` are validated too, and a non-https
`OIDC_ISSUER_URL` is refused unless `OIDC_ALLOW_INSECURE_ISSUER=true`.

Abridged (see the file for the full shape):

```typescript
export const config = {
  // Server
  nodeEnv, port, baseUrl,
  trustProxy,                    // reverse-proxy hop count for rate limiting (TRUST_PROXY)

  databaseUrl,                   // throws if DATABASE_URL is missing
  jwt: { secret, expiresIn, refreshSecret, refreshExpiresIn },
  cookie: { secure, sameSite, domain, path, maxAge },
  upload: { dir, maxFileSize },  // 50MB default

  // External services
  immich, openWeatherMap, aviationStack, nominatim, overpass, placeSearch,
  openRouteService,
  email,                         // SMTP
  frontendUrl,
  oidc,                          // OAuth/OIDC single sign-on (PKCE always on)
  auth,                          // passwordLoginDisabled, registrationDisabled
  security,                      // allowPrivateIntegrationUrls (SSRF guard escape hatch)
  vapid,                         // Web Push
  llm,                           // AI / LLM provider
  imap,                          // Saved-link email ingest
  scheduledBackup,
};

export default config;
```

### Environment Variables

The authoritative, current list (required, recommended, optional, rate limits,
OIDC, VAPID, IMAP, scheduled backups) is in [`backend/CLAUDE.md`](../../backend/CLAUDE.md).

**Required**:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/travel_life?schema=public
JWT_SECRET=<at least 32 chars, e.g. openssl rand -base64 48>
JWT_REFRESH_SECRET=<at least 32 chars>
NOMINATIM_URL=http://localhost:8080
```

**Optional** (examples):
```env
PORT=5000
NODE_ENV=production
IMMICH_API_URL=https://immich.example.com/api
IMMICH_API_KEY=immich-api-key
OPENWEATHERMAP_API_KEY=weather-api-key
OPENROUTESERVICE_API_KEY=ors-api-key
AVIATIONSTACK_API_KEY=aviationstack-key
```

---

## File Uploads

### Multer Configuration

**Pattern** (in controllers):
```typescript
import multer from 'multer';
import path from 'path';
import { config } from '../config';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.upload.dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxFileSize },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  },
});
```

**Usage in Routes**:
```typescript
router.post('/upload', authenticate, upload.single('photo'), photoController.uploadPhoto);
```

**Accessing File in Controller**:
```typescript
uploadPhoto: asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  const photoPath = req.file.path;
  // Process and save to database
}),
```

### Image Processing

**Using Sharp**:
```typescript
import sharp from 'sharp';

// Resize and create thumbnail
const thumbnailPath = `${photoPath}-thumb.jpg`;
await sharp(photoPath)
  .resize(300, 300, { fit: 'cover' })
  .jpeg({ quality: 80 })
  .toFile(thumbnailPath);
```

### EXIF Data Extraction

**Using exifr**:
```typescript
import exifr from 'exifr';

const exif = await exifr.parse(photoPath);
const latitude = exif?.latitude || null;
const longitude = exif?.longitude || null;
const takenAt = exif?.DateTimeOriginal || null;
```

---

## External Integrations

### Nominatim (Geocoding)

**Service Method**:
```typescript
async geocode(address: string) {
  const response = await axios.get(`${config.nominatim.url}/search`, {
    params: {
      q: address,
      format: 'json',
      limit: 1,
    },
  });

  if (response.data.length === 0) {
    throw new AppError('Address not found', 404);
  }

  const { lat, lon } = response.data[0];
  return { latitude: parseFloat(lat), longitude: parseFloat(lon) };
}
```

### Immich Integration

**Service Method**:
```typescript
async getImmichAssets(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { immichApiUrl: true, immichApiKey: true },
  });

  if (!user?.immichApiUrl || !user?.immichApiKey) {
    throw new AppError('Immich not configured', 400);
  }

  const response = await axios.get(`${user.immichApiUrl}/assets`, {
    headers: {
      'x-api-key': user.immichApiKey,
    },
  });

  return response.data;
}
```

### Other Integrations

Each lives in its own service under `src/services/`; configuration is in `src/config/index.ts` (see [Environment Variables](#environment-variables)).

| Integration | Service(s) |
| ----------- | ---------- |
| OpenWeatherMap (weather) | `weather.service.ts` |
| AviationStack (flight tracking) | `aviationstack.service.ts` |
| OpenRouteService (road routing, Haversine fallback) | `routing.service.ts`, `travelTime.service.ts` |
| Overpass + Nominatim place search (mobile nearby food) | `nearbyFood.service.ts`, `placeSearch.service.ts`, `openingHours.service.ts` |
| LLM provider, OpenAI-compatible (PDF import, AI suggestions) | `llm.service.ts`, `pdfImport.service.ts`, `aiSuggestion.service.ts`, `albumSuggestion.service.ts`, `journalEntryAi.service.ts`, `packingSuggestion.service.ts` |
| OIDC single sign-on | `oidc.service.ts` |
| SMTP email | `email.service.ts` |
| IMAP saved-link ingest | `emailIngest.service.ts`, `emailLinkExtractor.service.ts`, `linkMetadata.service.ts` |
| Web Push (VAPID) | `pushNotification.service.ts` |
| Frankfurter (exchange rates) | `exchangeRate.service.ts` |
| Backups (manual and scheduled) | `backup.service.ts`, `restore.service.ts`, `scheduledBackup.service.ts`, `backupIntegrity.service.ts` |

User-configured integration URLs (Immich, LLM, SMTP) are checked by the SSRF guard in `src/security/urlValidation.ts` when saved. Requests to a stored Immich or per-user LLM URL also spread `integrationRequestOptions(url)` from `src/security/integrationRequestGuard.ts` into their axios config: it re-checks the URL and connects through agents whose DNS lookup refuses private addresses, so a hostname re-pointed after saving (DNS rebinding) is not reached. Keep `maxRedirects: 0` next to it, and use it for any new outbound call to a URL a user configures. Admin-set env URLs are trusted and skip it.

---

## Common Patterns

### Service Singleton Pattern

```typescript
export class TripService {
  async createTrip(userId: number, data: CreateTripInput) {
    // Implementation
  }
}

export default new TripService();
```

**Import and use**:
```typescript
import tripService from '../services/trip.service';

const trip = await tripService.createTrip(userId, data);
```

### Conditional Update Pattern

```typescript
async updateTrip(userId: number, tripId: number, data: UpdateTripInput) {
  const updateData: any = {};

  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  // Only include fields that were provided

  const trip = await prisma.trip.update({
    where: { id: tripId },
    data: updateData,
  });

  return trip;
}
```

### Ownership Verification Pattern

```typescript
async deleteTrip(userId: number, tripId: number) {
  // 1. Find and verify ownership
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId },
  });

  if (!trip) {
    throw new AppError('Trip not found or unauthorized', 404);
  }

  // 2. Perform operation
  await prisma.trip.delete({
    where: { id: tripId },
  });

  return { message: 'Trip deleted successfully' };
}
```

### Pagination Pattern

```typescript
async getTrips(userId: number, query: GetTripQuery) {
  const page = parseInt(query.page || '1');
  const limit = parseInt(query.limit || '10');
  const skip = (page - 1) * limit;

  const where: any = { userId };

  const [trips, total] = await Promise.all([
    prisma.trip.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.trip.count({ where }),
  ]);

  return {
    trips,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
```

### Include Related Data Pattern

```typescript
const trip = await prisma.trip.findUnique({
  where: { id: tripId },
  include: {
    coverPhoto: true,
    locations: {
      include: {
        photos: true,
      },
    },
    tagAssignments: {
      include: {
        tag: true,
      },
    },
  },
});
```

### Select Specific Fields Pattern

```typescript
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: {
    id: true,
    username: true,
    email: true,
    timezone: true,
    // Only fetch needed fields
  },
});
```

---

## Code Patterns and Utilities

This section documents the standardized patterns and utility functions established during the backend optimization effort. These patterns reduce code duplication and ensure consistency across all controllers and services.

### Controller Pattern (asyncHandler)

**Purpose**: Eliminate try-catch boilerplate and provide consistent error handling across all controller methods.

**File**: `src/http/asyncHandler.ts`

```typescript
import { Request, Response, NextFunction } from 'express';

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
```

**Template Controller** (reference `activity.controller.ts`):

```typescript
import { Request, Response } from 'express';
import entityService from '../services/entity.service';
import { createEntitySchema, updateEntitySchema } from '../types/entity.types';
import { asyncHandler } from '../http/asyncHandler';
import { parseId } from '../http/parseId';
import { requireUserId } from '../auth/controllerHelpers';

export const entityController = {
  createEntity: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = createEntitySchema.parse(req.body);
    const entity = await entityService.createEntity(userId, data);
    res.status(201).json({ status: 'success', data: entity });
  }),

  getEntityById: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const entityId = parseId(req.params.id, 'id');
    const entity = await entityService.getEntityById(userId, entityId);
    res.status(200).json({ status: 'success', data: entity });
  }),

  updateEntity: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const entityId = parseId(req.params.id, 'id');
    const data = updateEntitySchema.parse(req.body);
    const entity = await entityService.updateEntity(userId, entityId, data);
    res.status(200).json({ status: 'success', data: entity });
  }),

  deleteEntity: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const entityId = parseId(req.params.id, 'id');
    await entityService.deleteEntity(userId, entityId);
    res.status(204).send();
  }),
};
```

**Key Benefits**:

- No try-catch blocks needed in individual methods
- Errors automatically passed to Express error handler
- Cleaner, more readable controller code
- Consistent error handling across all endpoints

**Helper Utilities**:

1. **`requireUserId(req)`** (`src/auth/controllerHelpers.ts`): Type-safe user extraction
   ```typescript
   const userId = requireUserId(req); // Throws 401 if not authenticated
   ```

2. **`parseId(value, paramName)`** (`src/http/parseId.ts`): Safe integer parsing
   ```typescript
   const tripId = parseId(req.params.tripId, 'tripId'); // Throws 400 if invalid
   ```

---

### Response Convention

**Purpose**: Keep API responses in a single consistent shape.

There is no `responseHelpers` module. Controllers write responses inline using
`res.status(...).json(...)` with the standard envelope:

```typescript
// Created (POST)
res.status(201).json({ status: 'success', data });

// OK with data (GET, PUT)
res.status(200).json({ status: 'success', data });

// OK with a message only
res.status(200).json({ status: 'success', message: 'Trip deleted successfully' });

// No content (DELETE, when nothing is returned)
res.status(204).send();
```

Error responses (`{ status: 'error', message, errors? }`) are produced
centrally by the error handler middleware, not by individual controllers.

---

### Shared Service Modules

**Purpose**: Reduce duplication across service files for common operations like authorization, update building, and entity cleanup.

**Directory**: `src/services/_shared/` — one module per concern (`tripAccess.ts`, `tripPermissions.ts`, `prismaUpdateData.ts`, `decimalConversion.ts`, `timezoneResolution.ts`, `entityLinkCleanup.ts`)

#### buildConditionalUpdateData

Builds update data objects for partial updates, handling empty strings and custom transformers.

```typescript
/**
 * Build update data with only defined fields
 * @param data - Partial data object
 * @param options.emptyStringToNull - Convert '' to null (default: true)
 * @param options.transformers - Custom field transformers
 */
export function buildConditionalUpdateData<T>(
  data: Partial<T>,
  options?: {
    emptyStringToNull?: boolean;
    transformers?: Record<string, (value: any) => any>;
  }
): Partial<T>
```

**Usage Examples**:

```typescript
import { buildConditionalUpdateData, tripDateTransformer } from './_shared/prismaUpdateData';

// Simple usage (empty strings become null)
const updateData = buildConditionalUpdateData(data);

// With date transformers
const updateData = buildConditionalUpdateData(data, {
  transformers: {
    startDate: tripDateTransformer,
    endDate: tripDateTransformer,
  }
});
```

**Before** (manual pattern):

```typescript
const updateData: any = {};
if (data.title !== undefined) updateData.title = data.title;
if (data.description !== undefined) updateData.description = data.description === '' ? null : data.description;
if (data.startDate !== undefined) updateData.startDate = data.startDate ? new Date(data.startDate + 'T00:00:00.000Z') : null;
// ... 10+ more fields
```

**After** (using helper):

```typescript
const updateData = buildConditionalUpdateData(data, {
  transformers: {
    startDate: tripDateTransformer,
    endDate: tripDateTransformer,
  }
});
```

#### cleanupEntityLinks

Removes all entity links when an entity is deleted.

```typescript
/**
 * Clean up entity links before deletion
 * @param tripId - The trip the entity belongs to
 * @param entityType - The type of entity being deleted
 * @param entityId - The ID of the entity being deleted
 * @param tx - Optional Prisma transaction client
 */
export async function cleanupEntityLinks(
  tripId: number,
  entityType: EntityType,
  entityId: number,
  tx?: TransactionClient
): Promise<void>
```

**Usage Example**:

```typescript
import { cleanupEntityLinks } from './_shared/entityLinkCleanup';

async deleteActivity(userId: number, activityId: number) {
  const activity = await verifyEntityAccessById('activity', activityId, userId);

  // Clean up any entity links before deletion
  await cleanupEntityLinks(activity.tripId, 'ACTIVITY', activityId);

  await prisma.activity.delete({ where: { id: activityId } });
}
```

#### Authorization Helpers

The service helpers also provide authorization utilities documented in the [Services Layer](#3-services-layer-srcservices) section:

- `verifyTripAccess(userId, tripId)` - Verify user owns trip
- `verifyEntityAccess(entity, userId, entityName)` - Verify entity ownership
- `verifyEntityInTrip(entityType, entityId, tripId)` - Verify entity belongs to trip
- `verifyEntityAccessById(entityType, entityId, userId)` - Combined find + verify

---

### Prisma Include Patterns

**Purpose**: Eliminate duplicated include blocks and ensure consistency across services.

**File**: `src/prisma/prismaIncludes.ts`

**Available Patterns**:

```typescript
// Photo album with photo count
export const photoAlbumsInclude = {
  select: {
    id: true,
    name: true,
    description: true,
    _count: { select: { photoAssignments: true } },
  },
} as const;

// Location with address (for timeline/print views)
export const locationWithAddressSelect = {
  id: true,
  name: true,
  address: true,
  latitude: true,
  longitude: true,
} as const;

// Trip access verification (minimal fields)
export const tripAccessSelect = {
  userId: true,
  privacyLevel: true,
} as const;

// Full activity include with relations
export const activityFullInclude = {
  location: { select: locationWithAddressSelect },
  parent: { select: parentActivitySelect },
  children: {
    select: childActivitySelect,
    orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
  },
  photoAlbums: photoAlbumsInclude,
} as const;

// Checklist with items
export const checklistWithItemsInclude = {
  items: {
    select: checklistItemSelect,
    orderBy: { sortOrder: 'asc' },
  },
} as const;
```

**When to Use Shared Includes vs Inline**:

| Scenario | Recommendation |
|----------|----------------|
| Include used in 3+ places | Create shared constant |
| Include is unique to one query | Use inline |
| Include pattern may change | Shared (single update point) |
| Complex nested includes | Shared (easier to read) |

**Usage Example**:

```typescript
import { activityFullInclude, locationWithAddressSelect } from '../prisma/prismaIncludes';

// Using shared include
const activity = await prisma.activity.findUnique({
  where: { id: activityId },
  include: activityFullInclude,
});

// Combining shared with custom
const activities = await prisma.activity.findMany({
  where: { tripId },
  include: {
    ...activityFullInclude,
    trip: { select: { timezone: true } }, // Additional field
  },
});
```

---

### Checklist Template Pattern

**Purpose**: Define default checklists with a data-driven template approach, making it easy to add new checklist types.

**File**: `src/services/checklist.service.ts`

**Template Structure**:

```typescript
interface ChecklistTemplate<T> {
  name: string;           // Display name
  description: string;    // User-facing description
  sortOrder: number;      // Display order
  data: T[];              // Source data array
  itemMapper: (item: T, index: number) => ChecklistItemCreateData;  // Transform function
}

const DEFAULT_CHECKLIST_TEMPLATES: Record<ChecklistType, ChecklistTemplate<unknown>> = {
  airports: {
    name: 'Airports',
    description: "Track airports you've visited around the world",
    sortOrder: 0,
    data: DEFAULT_AIRPORTS,  // Imported from data/checklist-defaults.ts
    itemMapper: (airport: unknown, index: number) => {
      const a = airport as { name: string; code: string; city: string; country: string };
      return {
        name: `${a.name} (${a.code})`,
        description: `${a.city}, ${a.country}`,
        isDefault: true,
        sortOrder: index,
        metadata: { code: a.code, city: a.city, country: a.country },
      };
    },
  },
  // ... other types
};
```

**How to Add a New Checklist Type**:

1. **Add data file** (`src/data/checklist-defaults.ts`):
   ```typescript
   export const DEFAULT_NATIONAL_PARKS = [
     { name: 'Yellowstone', state: 'WY', established: 1872 },
     { name: 'Yosemite', state: 'CA', established: 1890 },
     // ...
   ];
   ```

2. **Add type** (`src/types/checklist.types.ts`):
   ```typescript
   export type ChecklistType = 'airports' | 'countries' | 'cities' | 'us_states' | 'national_parks';
   ```

3. **Add template** (`src/services/checklist.service.ts`):
   ```typescript
   const DEFAULT_CHECKLIST_TEMPLATES: Record<ChecklistType, ChecklistTemplate<unknown>> = {
     // ... existing templates
     national_parks: {
       name: 'National Parks',
       description: "Track US National Parks you've visited",
       sortOrder: 4,
       data: DEFAULT_NATIONAL_PARKS,
       itemMapper: (park: unknown, index: number) => {
         const p = park as { name: string; state: string; established: number };
         return {
           name: p.name,
           description: `${p.state} - Est. ${p.established}`,
           isDefault: true,
           sortOrder: index,
           metadata: { name: p.name, state: p.state, established: p.established },
         };
       },
     },
   };
   ```

4. **Update initialization** (add to `checklistTypes` array):
   ```typescript
   const checklistTypes: ChecklistType[] = ['airports', 'countries', 'cities', 'us_states', 'national_parks'];
   ```

**Benefits of Template Pattern**:

- Data separated from logic
- Easy to add new checklist types
- Consistent structure across all checklists
- Type-safe with TypeScript generics
- Metadata enables auto-check functionality

---

## Best Practices

### DO

1. **Always validate inputs** with Zod schemas in controllers
2. **Always check req.user** for protected endpoints
3. **Always verify ownership** before updates/deletes
4. **Use AppError** for operational errors
5. **Use Prisma transactions** for multi-step operations
6. **Log important operations** (create, update, delete)
7. **Use TypeScript strict mode** and avoid `any` when possible
8. **Export singleton instances** of services and controllers
9. **Use `.nullable().optional()`** for update schemas (clearable fields)
10. **Use Promise.all()** for parallel database queries
11. **Use conditional updates** (only update provided fields)
12. **Use cascade deletes** in Prisma schema for cleanup
13. **Use select/include** to control returned data
14. **Use environment variables** for configuration
15. **Create migrations** for all schema changes

### DON'T

1. **Don't put business logic in controllers** - keep in services
2. **Don't put HTTP logic in services** - keep in controllers
3. **Don't expose sensitive data** in responses (passwords, API keys)
4. **Don't expose stack traces** in production
5. **Don't use `any` type** unless absolutely necessary
6. **Don't hardcode configuration** - use environment variables
7. **Don't edit migration files** - create new migrations
8. **Don't skip validation** - always validate user input
9. **Don't skip authorization checks** - verify ownership
10. **Don't return Prisma errors directly** - use error handler
11. **Don't use `.partial()` for update schemas** - explicitly define nullable fields
12. **Don't fetch unnecessary data** - use select/include wisely
13. **Don't perform DB queries in loops** - use bulk operations
14. **Don't trust client input** - always validate and sanitize
15. **Don't skip logging** - log important operations

### Security Best Practices

1. **Use bcrypt** for password hashing (not plain text)
2. **Use JWT** with short expiration (15 minutes)
3. **Use refresh tokens** for token renewal
4. **Validate all inputs** with Zod schemas
5. **Use helmet** for security headers
6. **Use rate limiting** to prevent abuse
7. **Use CORS** to restrict origins
8. **Never log sensitive data** (passwords, tokens)
9. **Use HTTPS** in production
10. **Keep dependencies updated** (npm audit)

### Performance Best Practices

1. **Use database indexes** on frequently queried fields
2. **Use pagination** for list endpoints
3. **Use Promise.all()** for parallel operations
4. **Use select** to fetch only needed fields
5. **Use caching** for frequently accessed data (Redis)
6. **Avoid N+1 queries** - use include/joins
7. **Use connection pooling** (Prisma handles this)
8. **Optimize image sizes** with Sharp
9. **Use background jobs** for heavy tasks (Bull/Agenda)
10. **Monitor performance** with logging/APM tools

### Testing Best Practices

1. **Write unit tests** for services
2. **Write integration tests** for controllers
3. **Mock external APIs** in tests
4. **Use test database** (separate from dev)
5. **Test error cases** (not just happy path)
6. **Test authorization** (ownership, permissions)
7. **Test validation** (Zod schemas)
8. **Use Jest** or similar testing framework
9. **Aim for >80% coverage** on critical paths
10. **Test edge cases** (null, empty, boundary values)

---

## Summary

The Travel Life backend follows a **layered architecture** with:
- **Routes**: Define endpoints and apply middleware
- **Controllers**: Handle HTTP, validate input, call services
- **Services**: Business logic and database operations
- **Prisma**: Type-safe database access

Key principles:
- **Type safety** with TypeScript and Zod
- **Authorization** with JWT and ownership checks
- **Error handling** with AppError and centralized middleware
- **Validation** at controller level with Zod schemas
- **Separation of concerns** across layers

For adding new features, follow the pattern:
1. Update Prisma schema  migrate
2. Create types with Zod schemas
3. Create service with business logic
4. Create controller with HTTP handling
5. Create routes and register in index.ts
