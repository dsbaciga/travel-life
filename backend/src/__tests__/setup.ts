// Test setup file
// This file runs before all tests

import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/travel_life_test';
// Secrets must be >= 32 chars and must not be a well-known placeholder value
// (see requireStrongSecret in src/config/index.ts).
process.env.JWT_SECRET =
  'jest-fixture-access-secret-4f8a1c93e27b06d5';
process.env.JWT_REFRESH_SECRET =
  'jest-fixture-refresh-secret-9b3d7e01a5c4f286';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
};

// Set longer timeout for integration tests
jest.setTimeout(10000);
