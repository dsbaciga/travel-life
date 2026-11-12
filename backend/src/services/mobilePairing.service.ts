import crypto from 'crypto';
import { AppError } from '../errors/errors';

/** How long a pairing token (or mobile OIDC exchange code) stays redeemable. */
export const PAIRING_TOKEN_TTL_MS = 5 * 60 * 1000;

/** Upper bound on outstanding tokens per user, so a script cannot grow the map. */
const MAX_ACTIVE_TOKENS_PER_USER = 5;

interface PairingRecord {
  userId: number;
  expiresAt: number;
  /**
   * SHA-256 (hex) of a secret only the requesting app instance holds. When set,
   * redeeming also requires that secret. Used by the mobile OIDC flow, where
   * the token is delivered over a custom URL scheme that another installed app
   * could have registered for.
   */
  challenge: string | null;
}

/**
 * A mobile OIDC sign-in the identity provider has completed but the user has
 * not yet confirmed. No exchange code exists until they do.
 */
interface PendingSignInRecord {
  userId: number;
  /** Shown on the confirmation page so the user sees which account is being handed over. */
  email: string;
  challenge: string;
  expiresAt: number;
}

/**
 * Short-lived, single-use tokens that hand a signed-in identity to the native
 * companion app.
 *
 * Two flows mint them:
 * - **QR pairing** — the web app's Settings page shows `{ serverUrl, pairingToken }`
 *   as a QR code; the phone scans it and redeems the token for its own
 *   access/refresh pair. A self-hosted user configures server URL *and* account
 *   in one scan.
 * - **Mobile OIDC** — the OIDC callback cannot hand tokens to a native app
 *   through cookies, so it redirects to the app's URL scheme with one of these
 *   as an exchange code. The code is not minted in the callback: the callback
 *   parks a *pending sign-in* behind a confirmation page, and only the user
 *   pressing Continue there (`confirmPendingSignIn`) mints it. Without that
 *   step another installed app could start the flow itself, claim the URL
 *   scheme, and — if the user already has an identity-provider session —
 *   collect a code with no user interaction at all.
 *
 * Storage is in-memory, like the token blacklist: tokens live five minutes, so
 * losing them on restart costs a user one re-scan. Only the SHA-256 of a token
 * is kept, so a heap dump cannot be replayed.
 */
class MobilePairingService {
  private readonly records = new Map<string, PairingRecord>();
  private readonly pendingSignIns = new Map<string, PendingSignInRecord>();

  private hash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private prune(now: number): void {
    for (const [key, record] of this.records) {
      if (record.expiresAt <= now) this.records.delete(key);
    }
    for (const [key, record] of this.pendingSignIns) {
      if (record.expiresAt <= now) this.pendingSignIns.delete(key);
    }
  }

  /** Drops a user's oldest entries until there is room for one more. */
  private evictOldest<T extends { userId: number; expiresAt: number }>(
    store: Map<string, T>,
    userId: number
  ): void {
    const mine = [...store.entries()]
      .filter(([, record]) => record.userId === userId)
      .sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    while (mine.length >= MAX_ACTIVE_TOKENS_PER_USER) {
      const oldest = mine.shift();
      if (oldest) store.delete(oldest[0]);
    }
  }

  /**
   * Mint a token for a user who has already proven their identity.
   *
   * @param userId - The authenticated user
   * @param challenge - Optional SHA-256 hex of a verifier the redeemer must present
   * @returns The raw token (shown once) and its expiry
   */
  createPairingToken(
    userId: number,
    challenge: string | null = null
  ): { token: string; expiresAt: Date } {
    const now = Date.now();
    this.prune(now);

    // Oldest-first eviction keeps the newest QR code valid when a user reopens
    // the dialog repeatedly.
    this.evictOldest(this.records, userId);

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = now + PAIRING_TOKEN_TTL_MS;
    this.records.set(this.hash(token), { userId, expiresAt, challenge });
    return { token, expiresAt: new Date(expiresAt) };
  }

  /**
   * Redeem a token. Succeeds at most once per token.
   *
   * The record is deleted *before* the expiry check so that an expired token
   * cannot be probed repeatedly, and so two concurrent redemptions cannot both
   * win (Map operations are synchronous on the single event loop).
   *
   * A token minted with a challenge is only redeemable together with the
   * matching verifier. A wrong verifier still consumes the token: whoever is
   * guessing does not get a second try, and the legitimate app simply signs
   * in again.
   *
   * @throws {AppError} 401 for an unknown, used, or expired token, or a wrong
   * verifier — one message for all so the response does not reveal which.
   */
  redeem(token: string, verifier?: string): number {
    const key = this.hash(token);
    const record = this.records.get(key);
    this.records.delete(key);
    if (!record || record.expiresAt <= Date.now()) {
      throw new AppError('Pairing code is invalid or has expired', 401);
    }
    if (record.challenge !== null) {
      const presented = Buffer.from(this.hash(verifier ?? ''), 'utf8');
      const expected = Buffer.from(record.challenge, 'utf8');
      if (presented.length !== expected.length || !crypto.timingSafeEqual(presented, expected)) {
        throw new AppError('Pairing code is invalid or has expired', 401);
      }
    }
    return record.userId;
  }

  /**
   * Park a completed mobile OIDC sign-in until the user confirms it.
   *
   * @param userId - The user the identity provider authenticated
   * @param email - Their email, echoed on the confirmation page
   * @param challenge - SHA-256 hex of the verifier held by the app that started the flow
   * @returns A single-use nonce for the confirmation form, and its expiry
   */
  createPendingSignIn(
    userId: number,
    email: string,
    challenge: string
  ): { nonce: string; expiresAt: Date } {
    const now = Date.now();
    this.prune(now);
    this.evictOldest(this.pendingSignIns, userId);

    const nonce = crypto.randomBytes(32).toString('hex');
    const expiresAt = now + PAIRING_TOKEN_TTL_MS;
    this.pendingSignIns.set(this.hash(nonce), { userId, email, challenge, expiresAt });
    return { nonce, expiresAt: new Date(expiresAt) };
  }

  /**
   * The user pressed Continue: consume the pending sign-in and mint the
   * exchange code, bound to the challenge the flow started with.
   *
   * Like `redeem`, the record is deleted before the expiry check, so a nonce
   * works at most once and an expired one cannot be probed.
   *
   * @throws {AppError} 401 for an unknown, used, or expired nonce
   */
  confirmPendingSignIn(nonce: string): { token: string; expiresAt: Date } {
    const key = this.hash(nonce);
    const pending = this.pendingSignIns.get(key);
    this.pendingSignIns.delete(key);
    if (!pending || pending.expiresAt <= Date.now()) {
      throw new AppError('Sign-in request is invalid or has expired', 401);
    }
    return this.createPairingToken(pending.userId, pending.challenge);
  }

  /** The user pressed Cancel: discard the pending sign-in. Unknown nonces are a no-op. */
  cancelPendingSignIn(nonce: string): void {
    this.pendingSignIns.delete(this.hash(nonce));
  }

  /** Test hook. */
  clear(): void {
    this.records.clear();
    this.pendingSignIns.clear();
  }
}

export default new MobilePairingService();
