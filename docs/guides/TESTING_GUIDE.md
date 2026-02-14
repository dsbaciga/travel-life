# Testing Guide for Travel Life

This document outlines the testing strategy and setup for Travel Life.

## Current Testing Status

**Backend**: Jest configured but no tests written
**Frontend**: No testing infrastructure configured
**E2E Tests**: Not configured

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

### Step 1: Install Dependencies

```bash
cd frontend
npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

### Step 2: Create Vitest Configuration

Create `frontend/vitest.config.ts`:

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
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### Step 3: Create Test Setup File

Create `frontend/src/test/setup.ts`:

```typescript
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});
```

### Step 4: Update package.json Scripts

Add to `frontend/package.json`:

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

Create `frontend/src/components/__tests__/ActivityManager.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
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

Create `frontend/src/components/__tests__/PhotoGallery.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
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

### Step 1: Create Jest Configuration

Create `backend/jest.config.js`:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
};
```

### Step 2: Create Test Setup

Create `backend/src/test/setup.ts`:

```typescript
// Global test setup
beforeAll(() => {
  // Set test environment
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  // Cleanup
});
```

### Step 3: Example Service Test

Create `backend/src/services/__tests__/activity.service.test.ts`:

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

```bash
cd backend
npm test                 # Run all tests
npm test -- --coverage   # With coverage
```

### E2E Tests

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

- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) - Current project status
- [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) - Feature documentation
- [CLAUDE.md](../CLAUDE.md) - Development guidelines
