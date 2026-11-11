/**
 * Mobile Pairing Service Tests
 *
 * Test cases:
 * - PAIR-001: A minted token redeems to its user exactly once
 * - PAIR-002: An unknown token is rejected
 * - PAIR-003: An expired token is rejected, and stays rejected
 * - PAIR-004: Tokens are 64 hex chars and unique
 * - PAIR-005: Oldest tokens are evicted beyond the per-user cap; other users are unaffected
 * - PAIR-006: Expiry is five minutes out
 * - PAIR-007: A challenged token needs the matching verifier, and a wrong guess burns it
 * - PAIR-008: An unchallenged token (QR pairing) ignores any verifier
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import crypto from 'crypto';
import mobilePairingService, { PAIRING_TOKEN_TTL_MS } from '../mobilePairing.service';
import { AppError } from '../../errors/errors';

const expectRejected = (token: string, verifier?: string): void => {
  let error: unknown;
  try {
    mobilePairingService.redeem(token, verifier);
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).statusCode).toBe(401);
};

describe('MobilePairingService', () => {
  beforeEach(() => {
    mobilePairingService.clear();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-11T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('PAIR-001: a minted token redeems to its user exactly once', () => {
    const { token } = mobilePairingService.createPairingToken(7);
    expect(mobilePairingService.redeem(token)).toBe(7);
    expectRejected(token);
  });

  it('PAIR-002: an unknown token is rejected', () => {
    expectRejected('f'.repeat(64));
  });

  it('PAIR-003: an expired token is rejected, and stays rejected', () => {
    const { token } = mobilePairingService.createPairingToken(7);
    jest.advanceTimersByTime(PAIRING_TOKEN_TTL_MS + 1);
    expectRejected(token);
    // Winding the clock back must not resurrect it: the failed attempt consumed it.
    jest.setSystemTime(new Date('2026-11-11T12:00:01Z'));
    expectRejected(token);
  });

  it('PAIR-004: tokens are 64 hex chars and unique', () => {
    const a = mobilePairingService.createPairingToken(1).token;
    const b = mobilePairingService.createPairingToken(1).token;
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).not.toBe(b);
  });

  it('PAIR-005: oldest tokens are evicted beyond the per-user cap', () => {
    const other = mobilePairingService.createPairingToken(99).token;
    const tokens: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      jest.advanceTimersByTime(1000);
      tokens.push(mobilePairingService.createPairingToken(7).token);
    }
    expectRejected(tokens[0]);
    expect(mobilePairingService.redeem(tokens[5])).toBe(7);
    expect(mobilePairingService.redeem(tokens[1])).toBe(7);
    expect(mobilePairingService.redeem(other)).toBe(99);
  });

  it('PAIR-006: expiry is five minutes out', () => {
    const { expiresAt } = mobilePairingService.createPairingToken(7);
    expect(expiresAt.toISOString()).toBe('2026-11-11T12:05:00.000Z');
  });

  it('PAIR-007: a challenged token needs the matching verifier, and a wrong guess burns it', () => {
    const verifier = 'correct-horse-battery-staple-verifier-0001';
    const challenge = crypto.createHash('sha256').update(verifier).digest('hex');

    const good = mobilePairingService.createPairingToken(7, challenge).token;
    expect(mobilePairingService.redeem(good, verifier)).toBe(7);

    // Intercepted code, no verifier: rejected.
    const stolen = mobilePairingService.createPairingToken(7, challenge).token;
    expectRejected(stolen);
    // ...and the failed attempt consumed it, so even the right verifier is too late.
    expectRejected(stolen, verifier);

    const guessed = mobilePairingService.createPairingToken(7, challenge).token;
    expectRejected(guessed, 'wrong-verifier');
  });

  it('PAIR-008: an unchallenged token (QR pairing) ignores any verifier', () => {
    const { token } = mobilePairingService.createPairingToken(7);
    expect(mobilePairingService.redeem(token, 'anything')).toBe(7);
  });
});
