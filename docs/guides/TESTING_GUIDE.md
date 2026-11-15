# Testing Guide for Travel Life

This document outlines the testing strategy and setup for Travel Life.

## Current Testing Status

Both the backend and frontend have working test infrastructure with test suites in place.

**Backend** (Jest + ts-jest): Fully configured with ~69 test files, including:

- `backend/src/controllers/__tests__/` - ~25 controller test files
- `backend/src/services/__tests__/` - ~34 service test files
- `backend/src/middleware/__tests__/` - middleware tests (`auth.test.ts`, `errorHandler.test.ts`)
- Additional test files across other backend modules

**Frontend** (Vitest + React Testing Library): Fully configured with test files in:

- `frontend/src/components/__tests__/` - component tests
- `frontend/src/services/__tests__/` - service tests
- `frontend/src/utils/__tests__/` - utility tests

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
It registers `@testing-library/jest-dom` matchers and runs cleanup after each test.

### package.json Scripts

The following scripts are already defined in `frontend/package.json`:

```json
{
  "scripts": {
    "test": "vitest",
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
It handles global test environment configuration.

### Example Service Test

`backend/src/services/__tests__/activity.service.test.ts` already exists. The
pattern below illustrates how services are tested for ownership verification:

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';
import { ActivityService } from '../activity.service';
import { prismaMock } from '../../test/prisma-mock';

describe('ActivityService', () => {
  let activityService: ActivityService;

  beforeEach(() => {
    activityService = new ActivityService();
  });

  describe('getActivitiesByTrip', () => {
    it('should return only activities owned by user', async () => {
      const userId = 1;
      const tripId = 1;

      prismaMock.trip.findUnique.mockResolvedValue({
        id: tripId,
        userId,
        // ... other trip fields
      });

      prismaMock.activity.findMany.mockResolvedValue([]);

      const activities = await activityService.getActivitiesByTrip(tripId, userId);

      expect(activities).toEqual([]);
      expect(prismaMock.trip.findUnique).toHaveBeenCalledWith({
        where: { id: tripId },
      });
    });

    it('should throw error if trip not owned by user', async () => {
      const userId = 1;
      const otherUserId = 2;
      const tripId = 1;

      prismaMock.trip.findUnique.mockResolvedValue({
        id: tripId,
        userId: otherUserId,
        // ... other trip fields
      });

      await expect(
        activityService.getActivitiesByTrip(tripId, userId)
      ).rejects.toThrow('Trip not found');
    });
  });
});
```

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

### Frontend Tests

```bash
cd frontend
npm test                  # Run tests in watch mode
npm run test:ui          # Run with UI
npm run test:coverage    # Generate coverage report
```

### Backend Tests

The backend `test` script is `jest --passWithNoTests` (the `--passWithNoTests`
flag means the run succeeds even if a glob matches no test files).

```bash
cd backend
npm test                 # Run all tests (jest --passWithNoTests)
npm test -- --coverage   # With coverage
```

### E2E Tests

E2E tests are not yet configured. Once Playwright has been added (see the E2E
Testing Setup section above), they can be run with:

```bash
npx playwright test              # Run all E2E tests
npx playwright test --ui         # Run with UI
npx playwright test --debug      # Debug mode
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

Add to `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd backend && npm ci
      - run: cd backend && npm test

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd frontend && npm ci
      - run: cd frontend && npm test

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npx playwright install
      - run: npx playwright test
```

---

## Next Steps

1. **Immediate Priority**: Set up frontend testing infrastructure
2. **High Priority**: Write tests for Manager components
3. **High Priority**: Write tests for photo loading
4. **Medium Priority**: Add backend service tests
5. **Medium Priority**: Set up E2E testing framework
6. **Long-term**: Achieve 80% test coverage across codebase

---

## Related Documentation

- [IMPLEMENTATION_STATUS.md](../development/IMPLEMENTATION_STATUS.md) - Current project status
- [DEVELOPMENT_WORKFLOWS.md](DEVELOPMENT_WORKFLOWS.md) - Feature development workflows
- [CLAUDE.md](../../CLAUDE.md) - Development guidelines

## Release verification against a real database

The backend unit tests mock Prisma. Before a release that touches dependencies, Prisma,
validation or the data path, run the built backend against real PostgreSQL and compare it
with the current release: see [tools/release-verify](../../tools/release-verify/README.md).
