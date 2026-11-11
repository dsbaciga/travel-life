/**
 * CSRF — native client (bearer-only) bypass tests
 *
 * Test cases:
 * - CSRF-MOB-001: Bearer header with no session cookie skips the double-submit check
 * - CSRF-MOB-002: Bearer header WITH a refresh cookie still requires a CSRF token
 * - CSRF-MOB-003: No Authorization header and no cookie is rejected
 * - CSRF-MOB-004: Malformed / empty bearer values do not qualify
 * - CSRF-MOB-005: X-Client-Platform alone grants nothing
 * - CSRF-MOB-006: Pairing and OIDC exchange endpoints are exempt, with exact path matching
 * - CSRF-MOB-007: isBearerOnlyRequest predicate
 */

import { describe, it, expect } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';

import { validateCsrf, isBearerOnlyRequest } from '../csrf';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  AuthenticatedRequest,
  MockResponse,
  MockNextFunction,
} from '../../__tests__/mockBuilders/requests';

// Same three structural adapters as csrf.test.ts — see the note there.
const asRequest = (req: Partial<AuthenticatedRequest>): Request => req as unknown as Request;
const asResponse = (res: MockResponse): Response => res as unknown as Response;
const asNext = (next: MockNextFunction): NextFunction => next as unknown as NextFunction;

interface RunOptions {
  path?: string;
  method?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}

function run(options: RunOptions = {}): { res: MockResponse; next: MockNextFunction } {
  const req = createMockRequest({
    method: options.method ?? 'POST',
    path: options.path ?? '/activities',
    headers: options.headers ?? {},
    cookies: options.cookies ?? {},
  });
  const res = createMockResponse();
  const next = createMockNext();
  validateCsrf(asRequest(req), asResponse(res), asNext(next));
  return { res, next };
}

function expectPassed({ res, next }: { res: MockResponse; next: MockNextFunction }): void {
  expect(next).toHaveBeenCalledTimes(1);
  expect(res.status).not.toHaveBeenCalled();
}

function expectRejected({ res, next }: { res: MockResponse; next: MockNextFunction }): void {
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(403);
}

describe('validateCsrf — native bearer-only clients', () => {
  it('CSRF-MOB-001: bearer header with no session cookie skips the check', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expectPassed(run({ method, headers: { authorization: 'Bearer abc.def.ghi' } }));
    }
  });

  it('CSRF-MOB-002: bearer header WITH a refresh cookie still requires a CSRF token', () => {
    // This is every request the web app makes: it sends a bearer token too, but
    // the cookie is what a cross-site attacker could ride, so the check stays.
    expectRejected(
      run({
        headers: { authorization: 'Bearer abc.def.ghi' },
        cookies: { refreshToken: 'some-refresh-token' },
      })
    );
  });

  it('CSRF-MOB-003: no Authorization header and no cookie is rejected', () => {
    expectRejected(run());
  });

  it('CSRF-MOB-004: malformed or empty bearer values do not qualify', () => {
    expectRejected(run({ headers: { authorization: 'Bearer ' } }));
    expectRejected(run({ headers: { authorization: 'Bearer    ' } }));
    expectRejected(run({ headers: { authorization: 'Basic dXNlcjpwYXNz' } }));
    expectRejected(run({ headers: { authorization: 'bearer abc' } }));
    expectRejected(run({ headers: { authorization: 'abc.def.ghi' } }));
  });

  it('CSRF-MOB-005: X-Client-Platform alone grants nothing', () => {
    expectRejected(run({ headers: { 'x-client-platform': 'mobile' } }));
    expectRejected(
      run({
        headers: { 'x-client-platform': 'mobile' },
        cookies: { refreshToken: 'some-refresh-token' },
      })
    );
  });

  it('CSRF-MOB-006: pairing and OIDC exchange endpoints are exempt, exactly', () => {
    expectPassed(run({ path: '/auth/mobile/pair' }));
    expectPassed(run({ path: '/auth/oidc/mobile-exchange' }));
    // Minting a pairing token is an authenticated web action and is NOT exempt.
    expectRejected(run({ path: '/auth/mobile/pairing-token' }));
    // Prefix and suffix tricks must not widen the exemption.
    expectRejected(run({ path: '/auth/mobile/pair/extra' }));
    expectRejected(run({ path: '/auth/mobile/pairx' }));
    expectRejected(run({ path: '/x/auth/mobile/pair' }));
  });

  it('CSRF-MOB-007: isBearerOnlyRequest predicate', () => {
    const make = (headers: Record<string, string>, cookies: Record<string, string>): Request =>
      asRequest(createMockRequest({ headers, cookies }));
    expect(isBearerOnlyRequest(make({ authorization: 'Bearer t' }, {}))).toBe(true);
    expect(isBearerOnlyRequest(make({ authorization: 'Bearer t' }, { 'csrf-token': 'x' }))).toBe(true);
    expect(isBearerOnlyRequest(make({ authorization: 'Bearer t' }, { refreshToken: 'r' }))).toBe(false);
    expect(isBearerOnlyRequest(make({}, {}))).toBe(false);
  });
});
