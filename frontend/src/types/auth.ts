export type User = {
  id: number;
  username: string;
  email: string;
  avatarUrl: string | null;
  /**
   * The user's configured IANA timezone. Carried in the session payload
   * because nearly every screen formats a date, and this is the fallback when
   * neither the entity nor its trip names a zone (see useTimezoneResolver).
   */
  timezone?: string | null;
  useCustomMapStyle?: boolean;
  /** Home currency (ISO 4217) budget totals are reported in; null = unset. */
  baseCurrency?: string | null;
}

export type AuthResponse = {
  user: User;
  accessToken: string;
  // refreshToken removed - now stored in httpOnly cookie
}

// Keep for backward compatibility during migration
export type LegacyAuthResponse = AuthResponse & {
  refreshToken?: string;
}

export type RegisterInput = {
  username: string;
  email: string;
  password: string;
}

export type LoginInput = {
  email: string;
  password: string;
}

export type OidcConfig = {
  enabled: boolean;
  buttonText: string;
  passwordLoginDisabled: boolean;
  /** Self-service sign-up is closed (DISABLE_REGISTRATION); absent on older servers. */
  registrationDisabled?: boolean;
}
