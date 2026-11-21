import axios from 'axios';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../config/database';
import { config } from '../config';
import logger from '../config/logger';
import { AppError } from '../middleware/errorHandler';
import { hashPassword } from '../auth/password';
import { generateAccessToken, generateRefreshToken } from '../auth/jwt';
import { companionService } from './companion.service';
import { AuthResponse } from '../types/auth.types';
import { defaultUserSettingsCreate, getUserPreferences } from './_shared/userSettings';

interface OidcDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
}

/** A single key from the provider's JWKS. Shape is validated by crypto.createPublicKey. */
interface OidcJwk {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
  [claim: string]: unknown;
}

interface OidcTokenResponse {
  access_token?: string;
  id_token?: string;
}

// Per-field .catch(undefined) keeps one malformed claim (e.g. a non-boolean
// email_verified from a quirky IdP) from discarding the whole claim set.
const oidcClaimsSchema = z.object({
  sub: z.string().optional().catch(undefined),
  email: z.string().optional().catch(undefined),
  email_verified: z.boolean().optional().catch(undefined),
  preferred_username: z.string().optional().catch(undefined),
  name: z.string().optional().catch(undefined),
});

export type OidcClaims = z.infer<typeof oidcClaimsSchema>;

const DISCOVERY_CACHE_TTL_MS = 60 * 60 * 1000;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
const HTTP_TIMEOUT_MS = 10000;
const USERNAME_MAX_LENGTH = 100;

// Asymmetric only. An IdP-supplied `alg` of HS256 (or `none`) would let a
// substituted token be "verified" against a public value, so those are refused.
const ID_TOKEN_ALGORITHMS = [
  'RS256', 'RS384', 'RS512',
  'PS256', 'PS384', 'PS512',
  'ES256', 'ES384', 'ES512',
  // EdDSA is deliberately absent: @types/jsonwebtoken does not model it, and no
  // mainstream OIDC provider signs ID tokens with it by default.
] as const satisfies readonly jwt.Algorithm[];

/**
 * Narrows a token header's `alg` to one this service will verify with.
 *
 * A guard rather than a cast: the header is attacker-supplied, so the list is
 * the only thing that may decide the value is acceptable.
 */
function isSupportedAlgorithm(alg: string | undefined): alg is jwt.Algorithm {
  return ID_TOKEN_ALGORITHMS.some((supported) => supported === alg);
}

// Tolerate modest clock skew between this host and the IdP when checking exp/iat.
const CLOCK_TOLERANCE_SECONDS = 60;

/**
 * Reduce an IdP-provided display name / preferred_username / email local part
 * to something that satisfies the username rules (3-255 chars).
 */
export const sanitizeUsername = (raw: string): string => {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, USERNAME_MAX_LENGTH);
  return cleaned.length >= 3 ? cleaned : `user${cleaned}`;
};

export class OidcService {
  private discovery: OidcDiscoveryDocument | null = null;
  private discoveryFetchedAt = 0;
  private jwks: OidcJwk[] | null = null;
  private jwksUri: string | null = null;
  private jwksFetchedAt = 0;

  private async getDiscovery(): Promise<OidcDiscoveryDocument> {
    if (this.discovery && Date.now() - this.discoveryFetchedAt < DISCOVERY_CACHE_TTL_MS) {
      return this.discovery;
    }

    const url = `${config.oidc.issuerUrl}/.well-known/openid-configuration`;
    let response;
    try {
      response = await axios.get<OidcDiscoveryDocument>(url, { timeout: HTTP_TIMEOUT_MS });
    } catch (error: unknown) {
      // Without this wrap a network/TLS/DNS failure surfaces to the client as a
      // bare 500 "Internal server error", which is undiagnosable from the UI.
      // The operator-facing hint (env var name, container reachability) is
      // logged only — /api/auth/oidc/login is unauthenticated, so the response
      // must not describe the deployment's configuration.
      const detail = error instanceof Error ? error.message : String(error);
      logger.error(
        `OIDC discovery fetch failed for ${url}: ${detail}. ` +
        'Check that OIDC_ISSUER_URL is correct and reachable from the backend container.'
      );
      throw new AppError('Single sign-on is temporarily unavailable', 502);
    }
    const doc = response.data;

    if (!doc?.issuer || !doc.authorization_endpoint || !doc.token_endpoint) {
      throw new AppError('OIDC discovery document is missing required endpoints', 502);
    }

    // OpenID Connect Discovery requires the document's `issuer` to equal the
    // issuer it was fetched for. Without this the ID token's `iss` check is
    // self-referential (compared against a value from the same document), so a
    // substituted document would validate itself. Fail closed.
    if (doc.issuer.replace(/\/+$/, '') !== config.oidc.issuerUrl) {
      logger.error(
        `OIDC discovery issuer mismatch: document reports "${doc.issuer}" but OIDC_ISSUER_URL is "${config.oidc.issuerUrl}"`
      );
      throw new AppError('OIDC discovery document issuer does not match the configured issuer', 502);
    }

    this.discovery = doc;
    this.discoveryFetchedAt = Date.now();
    return doc;
  }

  /**
   * Fetches (and caches) the provider's JWKS. `force` bypasses the cache, which
   * is how key rotation is picked up when a token arrives with an unknown kid.
   */
  private async fetchJwks(jwksUri: string, force: boolean): Promise<OidcJwk[]> {
    const cacheFresh =
      !force &&
      this.jwksUri === jwksUri &&
      Date.now() - this.jwksFetchedAt < JWKS_CACHE_TTL_MS;
    // Checked inline rather than via a stored boolean so the null check
    // actually narrows `this.jwks` for the return below.
    if (cacheFresh && this.jwks !== null) {
      return this.jwks;
    }

    let response;
    try {
      response = await axios.get<{ keys?: OidcJwk[] }>(jwksUri, { timeout: HTTP_TIMEOUT_MS });
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      logger.error(`OIDC JWKS fetch failed for ${jwksUri}: ${detail}`);
      throw new AppError('Unable to verify the OIDC ID token', 502);
    }

    const keys = Array.isArray(response.data?.keys) ? response.data.keys : [];
    if (keys.length === 0) {
      throw new AppError('OIDC provider published no signing keys', 502);
    }

    this.jwks = keys;
    this.jwksUri = jwksUri;
    this.jwksFetchedAt = Date.now();
    return keys;
  }

  /**
   * Verifies the ID token's signature against the provider's JWKS, plus its
   * standard time claims (exp/nbf, with a small clock tolerance).
   *
   * Signature verification is what makes the iss/aud checks meaningful: without
   * it, anyone who can substitute the token response can assert any sub/email.
   */
  private async verifyIdToken(
    discovery: OidcDiscoveryDocument,
    idToken: string
  ): Promise<Record<string, unknown>> {
    if (!discovery.jwks_uri) {
      throw new AppError('OIDC discovery document is missing jwks_uri', 502);
    }

    const complete = jwt.decode(idToken, { complete: true });
    if (!complete || typeof complete !== 'object') {
      throw new AppError('OIDC provider returned a malformed ID token', 502);
    }
    const alg = complete.header.alg;
    if (!isSupportedAlgorithm(alg)) {
      logger.error(`OIDC ID token uses unsupported algorithm "${alg}"`);
      throw new AppError('OIDC ID token uses an unsupported signing algorithm', 502);
    }

    const { kid } = complete.header;
    const selectKey = (keys: OidcJwk[]): OidcJwk | undefined =>
      keys.find((key) => key.use !== 'enc' && (kid ? key.kid === kid : true));

    let jwk = selectKey(await this.fetchJwks(discovery.jwks_uri, false));
    if (!jwk) {
      // Unknown kid usually means the provider rotated keys; refetch once.
      jwk = selectKey(await this.fetchJwks(discovery.jwks_uri, true));
    }
    if (!jwk) {
      throw new AppError('OIDC ID token signing key was not found in the provider JWKS', 502);
    }

    let publicKeyPem: string;
    try {
      publicKeyPem = crypto
        .createPublicKey({ key: jwk, format: 'jwk' })
        .export({ type: 'spki', format: 'pem' })
        .toString();
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      logger.error(`OIDC JWKS key could not be parsed: ${detail}`);
      throw new AppError('OIDC provider published an unusable signing key', 502);
    }

    try {
      const verified = jwt.verify(idToken, publicKeyPem, {
        algorithms: [alg],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
      });
      if (!verified || typeof verified !== 'object') {
        throw new AppError('OIDC provider returned a malformed ID token', 502);
      }
      return verified;
    } catch (error: unknown) {
      if (error instanceof AppError) {
        throw error;
      }
      const detail = error instanceof Error ? error.message : String(error);
      logger.error(`OIDC ID token verification failed: ${detail}`);
      throw new AppError('OIDC ID token signature or expiry is invalid', 502);
    }
  }

  /**
   * Builds the authorization redirect URL along with the state and PKCE
   * verifier that must be persisted (in a cookie) for the callback.
   */
  async createAuthorizationRequest(): Promise<{ url: string; state: string; codeVerifier: string }> {
    const discovery = await this.getDiscovery();

    const state = crypto.randomBytes(32).toString('base64url');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.oidc.clientId,
      redirect_uri: config.oidc.redirectUrl,
      scope: config.oidc.scopes,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const separator = discovery.authorization_endpoint.includes('?') ? '&' : '?';
    return {
      url: `${discovery.authorization_endpoint}${separator}${params.toString()}`,
      state,
      codeVerifier,
    };
  }

  /**
   * Exchanges the authorization code, resolves the external identity to a
   * local user (logging in, linking by email, or auto-provisioning), and
   * issues the same token pair as a password login.
   */
  async handleCallback(code: string, codeVerifier: string): Promise<AuthResponse> {
    const discovery = await this.getDiscovery();
    const claims = await this.fetchClaims(discovery, code, codeVerifier);

    if (!claims.sub) {
      throw new AppError('OIDC provider did not return a subject identifier', 502);
    }
    if (!claims.email) {
      throw new AppError('OIDC provider did not return an email address', 502);
    }
    if (claims.email_verified === false) {
      throw new AppError('OIDC email address is not verified', 403);
    }

    const subject = `${discovery.issuer}|${claims.sub}`.slice(0, 500);
    const email = claims.email.toLowerCase();
    const user = await this.resolveUser(subject, email, claims);

    // Ensure "Myself" companion exists (mirrors password login)
    await companionService.createMyselfCompanion(user.id, user.username);

    const prefs = await getUserPreferences(user.id);

    // passwordVersion is non-nullable in the schema (@default(0)), so no fallback needed
    const payload = {
      id: user.id,
      userId: user.id,
      email: user.email,
      passwordVersion: user.passwordVersion,
    };

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
        measurementSystem: prefs.measurementSystem,
      },
      accessToken: generateAccessToken(payload),
      refreshToken: generateRefreshToken(payload),
    };
  }

  private async fetchClaims(
    discovery: OidcDiscoveryDocument,
    code: string,
    codeVerifier: string
  ): Promise<OidcClaims> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.oidc.redirectUrl,
      client_id: config.oidc.clientId,
      code_verifier: codeVerifier,
    });
    // Public clients (no secret issued by the IdP) authenticate via PKCE alone;
    // sending an empty client_secret makes some providers reject the request.
    if (config.oidc.clientSecret) {
      params.set('client_secret', config.oidc.clientSecret);
    }

    let tokenResponse;
    try {
      tokenResponse = await axios.post<OidcTokenResponse>(discovery.token_endpoint, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: HTTP_TIMEOUT_MS,
      });
    } catch (error: unknown) {
      // IdPs return error/error_description bodies (no tokens) on failed
      // exchanges; logging them is safe and is the only way to diagnose
      // misconfigured client credentials or PKCE settings from the server side.
      let detail = error instanceof Error ? error.message : String(error);
      if (axios.isAxiosError(error) && error.response?.data) {
        detail = `${detail} — IdP response: ${JSON.stringify(error.response.data).slice(0, 500)}`;
      }
      logger.error(`OIDC token exchange failed at ${discovery.token_endpoint}: ${detail}`);
      throw new AppError('OIDC token exchange with the provider failed', 502);
    }

    const { id_token: idToken, access_token: accessToken } = tokenResponse.data;

    // The ID token is verified against the provider's JWKS (signature + exp/nbf)
    // before any claim is read. Issuer and audience are then checked explicitly,
    // or a misconfigured/multi-tenant IdP could hand us a validly signed token
    // minted for a different client or issuer.
    let claims: OidcClaims = {};
    if (idToken) {
      const decoded = await this.verifyIdToken(discovery, idToken);
      const audiences = Array.isArray(decoded.aud) ? decoded.aud : [decoded.aud];
      if (decoded.iss !== discovery.issuer || !audiences.includes(config.oidc.clientId)) {
        throw new AppError('OIDC ID token issuer or audience mismatch', 502);
      }
      const decodedClaims = oidcClaimsSchema.safeParse(decoded);
      if (decodedClaims.success) {
        claims = decodedClaims.data;
      }
    }

    // Some providers omit profile/email claims (or email_verified, which
    // account linking requires) from the ID token; fall back to userinfo
    if (
      (!claims.sub || !claims.email || claims.email_verified === undefined) &&
      discovery.userinfo_endpoint &&
      accessToken
    ) {
      const userinfoResponse = await axios.get<unknown>(discovery.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: HTTP_TIMEOUT_MS,
      });
      const userinfoClaims = oidcClaimsSchema.safeParse(userinfoResponse.data);
      if (userinfoClaims.success) {
        // ID token claims win; userinfo only fills the gaps
        claims = {
          sub: claims.sub ?? userinfoClaims.data.sub,
          email: claims.email ?? userinfoClaims.data.email,
          email_verified: claims.email_verified ?? userinfoClaims.data.email_verified,
          preferred_username: claims.preferred_username ?? userinfoClaims.data.preferred_username,
          name: claims.name ?? userinfoClaims.data.name,
        };
      }
    }

    return claims;
  }

  private async resolveUser(subject: string, email: string, claims: OidcClaims) {
    // 1. Returning OIDC user
    const existing = await prisma.user.findUnique({ where: { oidcSubject: subject } });
    if (existing) {
      return existing;
    }

    // 2. Existing password account with the same (verified) email - link it
    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      // Linking by email would let anyone who controls this address at the
      // IdP take over the account, so it requires an explicit verified claim.
      // OIDC_TRUST_EMAIL relaxes only the ABSENT case for IdPs that never emit
      // the claim; an explicit email_verified: false is always rejected.
      const emailTrusted =
        claims.email_verified === true ||
        (config.oidc.trustEmail && claims.email_verified === undefined);
      if (!emailTrusted) {
        throw new AppError('OIDC email address is not verified', 403);
      }
      logger.info(`Linking OIDC identity to existing account: ${email}`);
      return prisma.user.update({
        where: { id: byEmail.id },
        data: { oidcSubject: subject },
      });
    }

    // 3. First-time sign-in - provision a new account if allowed
    if (!config.oidc.autoProvision) {
      throw new AppError('No account exists for this identity', 403);
    }

    const username = await this.generateUniqueUsername(
      claims.preferred_username || claims.name || email.split('@')[0]
    );

    // OIDC users never use this password; a random hash keeps password login unusable
    const passwordHash = await hashPassword(crypto.randomBytes(32).toString('base64url'));

    logger.info(`Provisioning new user from OIDC sign-in: ${email}`);
    return prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        oidcSubject: subject,
        ...defaultUserSettingsCreate,
      },
    });
  }

  private async generateUniqueUsername(base: string): Promise<string> {
    const sanitized = sanitizeUsername(base);

    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = attempt === 0 ? sanitized : `${sanitized}${attempt + 1}`;
      const taken = await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } });
      if (!taken) {
        return candidate;
      }
    }

    return `${sanitized}-${crypto.randomBytes(4).toString('hex')}`;
  }
}

export default new OidcService();
