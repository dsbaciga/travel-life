# Testing Guide for Travel Life

This document outlines the testing strategy and setup for Travel Life.

## Current Testing Status

Every workspace except the E2E layer has a working test setup:

| Workspace | Runner | Location | Run from root |
| --------- | ------ | -------- | ------------- |
| `backend/` | Jest 29 + ts-jest | `backend/src/**/__tests__/*.test.ts` (~113 files: controllers, services, middleware, routes, auth) | `npm run test:backend` |
| `frontend/` | Vitest 4 + React Testing Library (jsdom) | `frontend/src/**/__tests__/` (~46 files: components, services, utils, hooks) | `npm run test:frontend` (runs `test:run`, non-watch) |
| `packages/shared/` | Vitest 4 (node) | `packages/shared/src/**/*.test.ts` (e.g. `src/__tests__/`) | `npm run test:shared` |
| `mobile/` | Vitest 4 (node, no React Native runtime) | `mobile/src/**/__tests__/**/*.test.ts` | `npm run test:mobile` |

**E2E Tests**: Not configured. There is no Playwright (or Cypress) config in the
repository. The E2E section below is a recommendation for future work, not a
description of an existing setup.

## Testing Strategy

### 1. Frontend Unit/Integration Tests (Vitest + React Testing Library)

**Priority Tests to Add**:

- **Manager Components** - Prevent infinite loop regressions
  - Test service adapter memoization
  - Test useEffect dependency arrays
  - Test tab navigation behavior

- **Photo Loading** - Prevent race conditions
  - Test thumbnail lazy loading
  - Test album pagination
  - Test Immich integration

- **Form Components** - Prevent validation issues
  - Test nullable/optional field handling
  - Test data submission
  - Test error states

### 2. Backend Unit Tests (Jest)

**Priority Tests to Add**:

- **Service Layer** - Business logic validation
  - Test ownership verification
  - Test update operations
  - Test cascade deletions

- **Controller Layer** - Request/response handling
  - Test authentication middleware
  - Test validation schemas
  - Test error responses

### 3. E2E Tests (Playwright or Cypress)

**Priority Flows to Test**:

- User authentication flow
- Trip creation and management
- Photo upload and album management
- Timeline navigation

---

## Frontend Testing Setup

The frontend testing infrastructure is already in place. This section documents
the existing configuration.

### Existing Dependencies

The following dev dependencies are already installed (see `frontend/package.json`):
`vitest`, `@vitest/ui`, `@vitest/coverage-v8`, `@testing-library/react`,
`@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, and
`fake-indexeddb`.

### Vitest Configuration

The config lives at `frontend/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/test/**',
        'src/types/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/**/*.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### Test Setup File

The setup file referenced by the config exists at `frontend/src/test/setup.ts`.
It registers `@testing-library/jest-dom` matchers, stubs `localStorage` and
`sessionStorage`, calls `vi.clearAllMocks()` before each test, and runs RTL cleanup
after each test. Shared helpers live next to it: `frontend/src/test/fixtures/` (sample
entities) and `frontend/src/test/mocks/` (`services.ts` exports ready-made `vi.fn()`
service mocks such as `mockActivityService`; `api.ts` mocks the axios layer).

### Known gotcha: lowercase drive letter on Windows

Vitest fails every file with `failed to find the runner` when the working directory
uses a lowercase drive letter (`c:/Users/...`). Run it from an uppercase path
(`C:/Users/...`), for example `cd C:/Users/<you>/travel-life/frontend && npm run test:run`.

### package.json Scripts

The following scripts are already defined in `frontend/package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

---

## Example Test: Manager Component (Infinite Loop Prevention)

`frontend/src/components/__tests__/ActivityManager.test.tsx` already exists. The
pattern below illustrates how Manager components are tested for infinite-loop
regressions:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import ActivityManager from '../ActivityManager';
import { activityService } from '../../services/activity.service';

// Mock the activity service
vi.mock('../../services/activity.service', () => ({
  activityService: {
    getActivitiesByTrip: vi.fn(),
    createActivity: vi.fn(),
    updateActivity: vi.fn(),
    deleteActivity: vi.fn(),
  },
}));

describe('ActivityManager', () => {
  const tripId = 1;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock successful response
    vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue([]);
  });

  it('should not cause infinite loop on mount', async () => {
    const getActivitiesSpy = vi.mocked(activityService.getActivitiesByTrip);

    render(
      <BrowserRouter>
        <ActivityManager tripId={tripId} />
      </BrowserRouter>
    );

    // Wait for initial load
    await waitFor(() => {
      expect(getActivitiesSpy).toHaveBeenCalledTimes(1);
    });

    // Wait a bit longer to ensure no additional calls
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should still only be called once
    expect(getActivitiesSpy).toHaveBeenCalledTimes(1);
  });

  it('should not reload when switching to tab and back', async () => {
    const getActivitiesSpy = vi.mocked(activityService.getActivitiesByTrip);

    const { rerender } = render(
      <BrowserRouter>
        <ActivityManager tripId={tripId} />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(getActivitiesSpy).toHaveBeenCalledTimes(1);
    });

    // Simulate tab switch by unmounting and remounting
    rerender(
      <BrowserRouter>
        <div>Other Tab</div>
      </BrowserRouter>
    );

    rerender(
      <BrowserRouter>
        <ActivityManager tripId={tripId} />
      </BrowserRouter>
    );

    // Should reload when coming back to tab
    await waitFor(() => {
      expect(getActivitiesSpy).toHaveBeenCalledTimes(2);
    });

    // Wait to ensure no infinite loop
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(getActivitiesSpy).toHaveBeenCalledTimes(2);
  });
});
```

---

## Example Test: Photo Loading (Race Condition Prevention)

`frontend/src/components/__tests__/PhotoGallery.test.tsx` already exists. The
pattern below illustrates how photo loading is tested for race conditions:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import PhotoGallery from '../PhotoGallery';
import { photoService } from '../../services/photo.service';

vi.mock('../../services/photo.service', () => ({
  photoService: {
    getPhotosByTrip: vi.fn(),
    getPhotosByLocation: vi.fn(),
  },
}));

describe('PhotoGallery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not load all thumbnails at once', async () => {
    // Mock 100 photos
    const mockPhotos = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      filename: `photo${i + 1}.jpg`,
      tripId: 1,
    }));

    vi.mocked(photoService.getPhotosByTrip).mockResolvedValue(mockPhotos);

    render(
      <BrowserRouter>
        <PhotoGallery tripId={1} />
      </BrowserRouter>
    );

    // Should use lazy loading or pagination
    // Verify not all photos are rendered immediately
    await waitFor(() => {
      const images = screen.queryAllByRole('img');
      // Should render a reasonable initial batch (e.g., 20-30)
      expect(images.length).toBeLessThan(50);
    });
  });

  it('should handle album pagination correctly', async () => {
    const mockPhotos = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      filename: `photo${i + 1}.jpg`,
      albumId: 1,
    }));

    vi.mocked(photoService.getPhotosByTrip).mockResolvedValue(mockPhotos);

    render(
      <BrowserRouter>
        <PhotoGallery albumId={1} />
      </BrowserRouter>
    );

    await waitFor(() => {
      // Verify pagination controls exist
      expect(screen.queryByText(/Load More/i) || screen.queryByText(/Next/i)).toBeTruthy();
    });
  });
});
```

---

## Backend Testing Setup

The backend testing infrastructure is already in place. This section documents
the existing configuration.

### Jest Configuration

The config lives at `backend/jest.config.js`:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/types/**',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json',
      },
    ],
  },
};
```

### Test Setup File

The setup file referenced by `setupFilesAfterEnv` exists at
`backend/src/__tests__/setup.ts` (note: under `src/__tests__/`, not `src/test/`).
It sets `NODE_ENV=test`, a dummy `DATABASE_URL`, strong fixture JWT secrets (the config
rejects short or placeholder secrets), silences `console.error`/`console.warn`, and sets a
10s timeout.

Shared helpers live beside it in `backend/src/__tests__/`:

- `mocks/prisma.ts` - `mockPrismaClient` (every model delegate with `jest.fn()` methods)
  and `resetPrismaMocks()`; also re-exported from `mocks/index.ts`
- `mocks/external-apis.ts` - Nominatim, Immich, weather and routing response mocks
- `mockBuilders/` - request/response/auth builders for controller tests
- `fixtures/` - sample users, trips and photos

### How Prisma is mocked

There is no `prisma-mock` or `jest-mock-extended` dependency. Tests replace the
database module with a plain object of `jest.fn()` delegates. `jest.mock()` calls are
hoisted above imports, so the service under test picks up the mock:

```typescript
// 1. Stub @prisma/client (enums and Prisma.Decimal are used at import time)
jest.mock('@prisma/client', () => ({
  Prisma: { Decimal: class MockDecimal { /* toString, toNumber */ } },
  EntityType: { PHOTO: 'PHOTO', LOCATION: 'LOCATION', ACTIVITY: 'ACTIVITY' /* ... */ },
}));

// 2. Replace the Prisma singleton from config/database
const mockPrisma = {
  trip: { findFirst: jest.fn() },
  activity: { create: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('../../config/database', () => ({ __esModule: true, default: mockPrisma }));
```

Alternatively, import the shared mock instead of hand-writing delegates, as the
controller tests do:

```typescript
import { mockPrismaClient, resetPrismaMocks } from '../../__tests__/mocks/prisma';

jest.mock('../../config/database', () => ({ __esModule: true, default: mockPrismaClient }));
```

Gotchas:

- Prefix hand-rolled mock variables with `mock` (`mockPrisma`) so Jest allows them
  inside the hoisted factory.
- Call `jest.clearAllMocks()` (or `resetPrismaMocks()`) in `beforeEach`.
- Trip access goes through `verifyTripAccessWithPermission`, which reads
  `prisma.trip.findFirst` and includes `collaborators`; default that mock to a trip owned
  by the test user and override it for the "other user" cases.
- Services export a singleton (`import activityService from '../activity.service'`), not a
  class you instantiate.

### Example Service Test

`backend/src/services/__tests__/activity.service.test.ts` is the reference. It opens
with a test-ID header (ACT-001 and so on), mocks as above, and asserts both the
Prisma calls and the access-control failures:

```typescript
import activityService from '../activity.service';
import { AppError } from '../../errors/errors';

describe('ActivityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.trip.findFirst.mockResolvedValue({
      id: 100, userId: 1, privacyLevel: 'Private', collaborators: [],
    });
  });

  it('rejects a user with no access to the trip', async () => {
    mockPrisma.trip.findFirst.mockResolvedValue(null);

    await expect(activityService.getActivitiesByTrip(2, 100)).rejects.toThrow(AppError);
  });
});
```

### Controller tests

Most controllers are a single `createCrudController(...)` config, so
`backend/src/controllers/__tests__/*.controller.test.ts` mock the service module and
verify, per handler, the service method called, the arguments built from
`req.params`/body, the status code, and Zod body validation.

### Shared helper tests

Backend helpers under `src/services/_shared/` (for example `prismaUpdateData`,
`tripAccess`, `decimalConversion`) have tests in `src/services/_shared/__tests__/`.

---

## E2E Testing Setup

E2E testing is **not yet configured** — there is no Playwright or Cypress config
in the repository. The steps below describe how to add it.

### Recommended: Playwright

```bash
npm init playwright@latest
```

Example E2E test in `e2e/auth.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('user can login and view dashboard', async ({ page }) => {
  await page.goto('http://localhost:3000/login');

  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL('http://localhost:3000/dashboard');
  await expect(page.locator('h1')).toContainText('My Trips');
});
```

---

## Running Tests

From the repository root:

```bash
npm run test:backend     # Jest
npm run test:frontend    # Vitest, single run (frontend test:run)
npm run test:shared      # packages/shared, Vitest
npm run test:mobile      # mobile, Vitest
```

### Frontend Tests

```bash
cd frontend
npm test                 # Watch mode
npm run test:run         # Single run (what CI uses)
npm run test:ui          # Vitest UI
npm run test:coverage    # Coverage report
```

Run from an uppercase drive letter on Windows (see the gotcha above).

### Backend Tests

The backend `test` script is `jest --passWithNoTests` (the `--passWithNoTests`
flag means the run succeeds even if a glob matches no test files).

```bash
cd backend
npm test                                  # Run all tests
npm test -- --coverage                    # With coverage
npm test -- activity.service              # One file by name pattern
```

CI runs `npx prisma generate` first; the tests need the generated client types.

### E2E Tests

E2E tests are not yet configured. Once Playwright has been added (see the E2E
Testing Setup section above), they can be run with:

```bash
npx playwright test              # Run all E2E tests
npx playwright test --ui         # Run with UI
npx playwright test --debug      # Debug mode
```

---

## Testing packages/shared

`packages/shared` (`@travel-life/shared`) holds platform-free code used by the mobile
app and, via vendoring, the backend: types, validation, time, itinerary, entity-link,
receipt and food helpers. Its Vitest config (`packages/shared/vitest.config.mts`) uses the
`node` environment and picks up `src/**/*.test.ts`. Tests are plain input/output checks
with no mocking:

```bash
cd packages/shared
npm test               # vitest run
npm run test:watch
```

### Vendored-module drift test

The backend Docker build context is `./backend`, so it cannot import `packages/shared`.
Three dependency-free modules (`utils/geo.ts`, `receipt/receiptParser.ts`,
`food/nearbyFood.ts`) are instead copied into `backend/src/services/_shared/vendored/` by
`packages/shared/scripts/sync-vendored.mjs`. Those copies are generated; never edit them.

- Edit the source in `packages/shared/src/`, then run `npm run sync:vendored` from the root.
- `node packages/shared/scripts/sync-vendored.mjs --check` exits 1 on drift.
- The backend test `VEND-001` in `backend/src/services/__tests__/mobileCompanion.service.test.ts`
  fails if a vendored copy no longer matches its source (ignoring the generated header and
  line endings). If it fails, re-run the sync script.
- A module can only be vendored if it has no imports.

---

## Testing the mobile app

`mobile/vitest.config.mts` runs unit tests in plain Node (`src/**/__tests__/**/*.test.ts`),
with `__DEV__` defined, `@travel-life/shared` aliased to `packages/shared/src`, and
`react-native` aliased to `react-native-web`. Only the platform-free core is covered:
`db/`, `sync/`, `domain/` and `lib/`. UI and Expo-specific code is not unit tested.

Two helpers in `mobile/src/test/` replace the native pieces:

- `nodeSqliteDriver.ts` - `createNodeSqliteDriver()` returns an in-memory `SqlDriver` backed
  by Node's built-in `node:sqlite` (same SQL dialect as expo-sqlite). It uses the app's
  real `createSerializedDriver` and runs the real `migrate()`, so schema, migrations,
  outbox and id-remap statements execute for real instead of against a mock. Call
  `close()` when done.
- `fakeServer.ts` - an in-memory stand-in for the Travel Life API implementing the `SyncApi`
  interface. It handles the same routes the outbox emits, assigns integer ids, keeps the
  entity and link graph, and enforces the constraints that matter for sync (references must
  be existing server ids, links unique per source/target, unknown ids are 404).

A sync test pairs the two: open a Node SQLite driver, write rows and outbox entries, run
the sync engine against the fake server, then assert on both databases.

```bash
cd mobile
npm test               # vitest run
npm run test:watch
```

---

## Test Coverage Goals

- **Critical Paths**: 80% coverage minimum
- **Manager Components**: 100% coverage (prevent infinite loops)
- **Photo Loading**: 100% coverage (prevent race conditions)
- **Service Layer**: 80% coverage
- **Controllers**: 70% coverage

---

## CI/CD Integration

Tests run in `.github/workflows/docker-build-test.yml`, job `lint-and-test`, as a matrix
over `backend` and `frontend` (Node 26, `npm ci` per component). For each component the
job runs:

- frontend: `npm run lint`, `npm run build:strict`, `npm run test:run`
- backend: `npx prisma generate`, `npm run build` (the relaxed production tsconfig),
  `npm run build:strict`, `npm test`

`packages/shared` and `mobile` tests are **not** run in CI; run `npm run test:shared` and
`npm run test:mobile` locally. There is no E2E job.

---

## Next Steps

1. Add `test:shared` and `test:mobile` to the CI matrix
2. Keep writing Manager-component and photo-loading tests
3. Set up E2E testing framework
4. Long-term: Achieve 80% test coverage across codebase

---

## Related Documentation

- [IMPLEMENTATION_STATUS.md](../development/IMPLEMENTATION_STATUS.md) - Current project status
- [DEVELOPMENT_WORKFLOWS.md](DEVELOPMENT_WORKFLOWS.md) - Feature development workflows
- [CLAUDE.md](../../CLAUDE.md) - Development guidelines

## Release verification against a real database

The backend unit tests mock Prisma. Before a release that touches dependencies, Prisma,
validation or the data path, run the built backend against real PostgreSQL and compare it
with the current release: see [tools/release-verify](../../tools/release-verify/README.md).
