import { z } from 'zod';

// Validation schemas
export const registerSchema = z.object({
  username: z.string().min(3).max(255),
  email: z.string().email().max(255),
  password: z.string().min(8).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

/** Body of the mobile QR pairing endpoint. */
export const mobilePairSchema = z.object({
  pairingToken: z.string().regex(/^[a-f0-9]{64}$/, 'Malformed pairing token'),
});

/** Body of the mobile OIDC code exchange endpoint. */
export const mobileOidcExchangeSchema = z.object({
  code: z.string().regex(/^[a-f0-9]{64}$/, 'Malformed exchange code'),
  // The secret whose SHA-256 the app sent as `code_challenge` when it started
  // the login. Proves the exchange comes from the app instance that began it.
  codeVerifier: z.string().min(32).max(256),
});

/** Form body posted by the mobile sign-in confirmation page. */
export const mobileOidcConfirmSchema = z.object({
  nonce: z.string().regex(/^[a-f0-9]{64}$/, 'Malformed nonce'),
  action: z.enum(['continue', 'cancel']),
});

/** `code_challenge` on a mobile OIDC login: lowercase hex SHA-256. */
export const MOBILE_CODE_CHALLENGE_PATTERN = /^[a-f0-9]{64}$/;

// Types
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export interface AuthResponse {
  user: {
    id: number;
    username: string;
    email: string;
    avatarUrl: string | null;
    /** IANA zone the client formats dates in when nothing more specific applies. */
    timezone: string | null;
  };
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  id: number;  // User ID (aliased for convenience)
  userId: number;  // Same as id (for compatibility)
  email: string;
  passwordVersion?: number;  // Used to invalidate tokens after password change
}
