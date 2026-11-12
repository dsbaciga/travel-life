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
 * - PAIR-009: Confirming a pending sign-in mints a code bound to its challenge, exactly once
 * - PAIR-010: A pending sign-in expires after five minutes, and stays expired
 * - PAIR-011: Cancelling discards a pending sign-in; unknown nonces are a no-op
 * - PAIR-012: Nonces and exchange codes live in separate namespaces
 * - PAIR-013: Oldest pending sign-ins are evicted beyond the per-user cap
 * - PAIR-014: The code minted on confirmation gets its own five-minute lifetime
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

const expectConfirmRejected = (nonce: string): void => {
  let error: unknown;
  try {
    mobilePairingService.confirmPendingSignIn(nonce);
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).statusCode).toBe(401);
};

const VERIFIER = 'correct-horse-battery-staple-verifier-0001';
const CHALLENGE = crypto.createHash('sha256').update(VERIFIER).digest('hex');

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

  it('PAIR-009: confirming a pending sign-in mints a challenged code, exactly once', () => {
    const { nonce } = mobilePairingService.createPendingSignIn(7, 'dana@example.com', CHALLENGE);
    expect(nonce).toMatch(/^[a-f0-9]{64}$/);

    const { token } = mobilePairingService.confirmPendingSignIn(nonce);
    expect(token).not.toBe(nonce);
    expectConfirmRejected(nonce);

    // The code is bound to the challenge the sign-in was parked with.
    expect(mobilePairingService.redeem(token, VERIFIER)).toBe(7);

    const second = mobilePairingService.createPendingSignIn(7, 'dana@example.com', CHALLENGE);
    expectRejected(mobilePairingService.confirmPendingSignIn(second.nonce).token, 'wrong-verifier');
  });

  it('PAIR-010: a pending sign-in expires after five minutes, and stays expired', () => {
    const live = mobilePairingService.createPendingSignIn(7, 'dana@example.com', CHALLENGE);
    const dead = mobilePairingService.createPendingSignIn(7, 'dana@example.com', CHALLENGE);
    expect(live.expiresAt.toISOString()).toBe('2026-11-11T12:05:00.000Z');

    jest.advanceTimersByTime(PAIRING_TOKEN_TTL_MS - 1);
    expect(mobilePairingService.confirmPendingSignIn(live.nonce).token).toMatch(/^[a-f0-9]{64}$/);

    jest.advanceTimersByTime(1);
    expectConfirmRejected(dead.nonce);
    jest.setSystemTime(new Date('2026-11-11T12:00:01Z'));
    expectConfirmRejected(dead.nonce);
  });

  it('PAIR-011: cancelling discards a pending sign-in', () => {
    const { nonce } = mobilePairingService.createPendingSignIn(7, 'dana@example.com', CHALLENGE);
    const other = mobilePairingService.createPendingSignIn(7, 'dana@example.com', CHALLENGE);

    mobilePairingService.cancelPendingSignIn(nonce);
    expectConfirmRejected(nonce);

    // Unknown nonces are ignored, and other pending sign-ins are untouched.
    expect(() => mobilePairingService.cancelPendingSignIn('f'.repeat(64))).not.toThrow();
    expect(mobilePairingService.confirmPendingSignIn(other.nonce).token).toMatch(/^[a-f0-9]{64}$/);
  });

  it('PAIR-012: nonces and exchange codes live in separate namespaces', () => {
    const { nonce } = mobilePairingService.createPendingSignIn(7, 'dana@example.com', CHALLENGE);
    // A nonce is not redeemable for tokens, and trying does not consume it.
    expectRejected(nonce, VERIFIER);
    const { token } = mobilePairingService.confirmPendingSignIn(nonce);

    // An exchange code cannot be "confirmed" into a fresh code, nor cancelled away.
    expectConfirmRejected(token);
    mobilePairingService.cancelPendingSignIn(token);
    expect(mobilePairingService.redeem(token, VERIFIER)).toBe(7);
  });

  it('PAIR-013: oldest pending sign-ins are evicted beyond the per-user cap', () => {
    const other = mobilePairingService.createPendingSignIn(99, 'sam@example.com', CHALLENGE).nonce;
    const nonces: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      jest.advanceTimersByTime(1000);
      nonces.push(mobilePairingService.createPendingSignIn(7, 'dana@example.com', CHALLENGE).nonce);
    }
    expectConfirmRejected(nonces[0]);
    const newest = mobilePairingService.confirmPendingSignIn(nonces[5]).token;
    expect(mobilePairingService.redeem(newest, VERIFIER)).toBe(7);
    const foreign = mobilePairingService.confirmPendingSignIn(other).token;
    expect(mobilePairingService.redeem(foreign, VERIFIER)).toBe(99);
  });

  it('PAIR-014: the code minted on confirmation gets its own five-minute lifetime', () => {
    const { nonce } = mobilePairingService.createPendingSignIn(7, 'dana@example.com', CHALLENGE);
    jest.advanceTimersByTime(4 * 60 * 1000);
    const { token, expiresAt } = mobilePairingService.confirmPendingSignIn(nonce);
    expect(expiresAt.toISOString()).toBe('2026-11-11T12:09:00.000Z');

    jest.advanceTimersByTime(PAIRING_TOKEN_TTL_MS);
    expectRejected(token, VERIFIER);
  });
});
