import dotenv from 'dotenv';

dotenv.config();

// Validate required JWT secrets.
// Tokens are HS256, so the signing key is directly offline-crackable from a
// single issued token — presence alone is not enough, the secret must also be
// long and non-guessable. The strength check is skipped under NODE_ENV=test so
// the suite's fixture secrets keep working; production/dev always enforce it.
const MIN_JWT_SECRET_LENGTH = 32;
const WEAK_JWT_SECRETS = new Set([
  'changeme',
  'change-me',
  'changethis',
  'change-this',
  'secret',
  'jwtsecret',
  'jwt-secret',
  'mysecret',
  'my-secret',
  'password',
  'test',
  'testsecret',
  'test-secret',
  'default',
  'placeholder',
  'your-secret-key',
  'your_secret_key',
  'supersecret',
  'super-secret',
]);

const requireStrongSecret = (name: string, value: string | undefined): string => {
  if (!value) {
    throw new Error(
      `${name} environment variable is required. ` +
      'Set it in your .env file or environment variables.'
    );
  }
  if (process.env.NODE_ENV === 'test') {
    return value;
  }
  if (value.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `${name} is too weak: it must be at least ${MIN_JWT_SECRET_LENGTH} characters. ` +
      'Generate one with: openssl rand -base64 48'
    );
  }
  if (WEAK_JWT_SECRETS.has(value.trim().toLowerCase())) {
    throw new Error(
      `${name} is set to a well-known placeholder value. ` +
      'Generate a real secret with: openssl rand -base64 48'
    );
  }
  return value;
};

const jwtSecret = requireStrongSecret('JWT_SECRET', process.env.JWT_SECRET);
const jwtRefreshSecret = requireStrongSecret('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET);

export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  baseUrl: process.env.BASE_URL || 'http://localhost:5000',

  // Database
  databaseUrl: (() => {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'DATABASE_URL environment variable is required. ' +
        'Set it in your .env file or environment variables.'
      );
    }
    return url;
  })(),

  // JWT
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: jwtRefreshSecret,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Cookie (for secure refresh token storage)
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: ((): 'strict' | 'lax' | 'none' => {
      // Empty counts as unset — compose passes through blank vars as ''.
      const val = process.env.COOKIE_SAME_SITE || 'strict';
      if (val === 'strict' || val === 'lax' || val === 'none') {
        return val; // narrowed to 'strict' | 'lax' | 'none' by the equality checks
      }
      throw new Error(`Invalid COOKIE_SAME_SITE value "${val}". Must be strict, lax, or none.`);
    })(),
    domain: process.env.COOKIE_DOMAIN || undefined, // e.g., '.example.com' for subdomains
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  },

  // File Upload
  upload: {
    dir: process.env.UPLOAD_DIR || './uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800', 10), // 50MB
  },

  // External APIs
  immich: {
    apiUrl: process.env.IMMICH_API_URL || '',
    apiKey: process.env.IMMICH_API_KEY || '',
  },

  openWeatherMap: {
    apiKey: process.env.OPENWEATHERMAP_API_KEY || '',
  },

  aviationStack: {
    apiKey: process.env.AVIATIONSTACK_API_KEY || '',
  },

  nominatim: {
    url: process.env.NOMINATIM_URL || 'http://localhost:8080',
  },

  openRouteService: {
    apiKey: process.env.OPENROUTESERVICE_API_KEY,
    url: process.env.OPENROUTESERVICE_URL,
  },

  // Email (SMTP)
  email: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true', // true for port 465, false for other ports
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || 'Travel Life <noreply@example.com>',
  },

  // Frontend URL (for email links)
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  // OAuth / OIDC single sign-on (enabled when issuer + client ID are set; client
  // secret is optional — public clients rely on PKCE, which is always used)
  oidc: (() => {
    const issuerUrl = (process.env.OIDC_ISSUER_URL || '').replace(/\/+$/, '');
    const clientId = process.env.OIDC_CLIENT_ID || '';
    const clientSecret = process.env.OIDC_CLIENT_SECRET || '';
    // Discovery and the token exchange both run against the issuer. Over plain
    // HTTP anyone on the path (a compromised container on the same Docker
    // network, a hostile LAN) can substitute a token response and take over any
    // account, so a non-https issuer must be opted into explicitly.
    if (issuerUrl && !issuerUrl.startsWith('https:') && process.env.OIDC_ALLOW_INSECURE_ISSUER !== 'true') {
      throw new Error(
        `OIDC_ISSUER_URL must use https (got "${issuerUrl}"). ` +
        'Set OIDC_ALLOW_INSECURE_ISSUER=true to allow a plaintext issuer for local development.'
      );
    }
    return {
      enabled: Boolean(issuerUrl && clientId),
      issuerUrl,
      clientId,
      clientSecret,
      redirectUrl:
        process.env.OIDC_REDIRECT_URL ||
        `${process.env.BASE_URL || 'http://localhost:5000'}/api/auth/oidc/callback`,
      scopes: process.env.OIDC_SCOPES || 'openid profile email',
      buttonText: process.env.OIDC_BUTTON_TEXT || 'Sign in with SSO',
      autoProvision: process.env.OIDC_AUTO_PROVISION !== 'false',
      // Opt-in for IdPs that never emit email_verified (e.g. some self-hosted
      // providers): treat an ABSENT claim as verified when linking accounts by
      // email. An explicit email_verified: false is still rejected. Only set
      // this when you fully control the IdP and its email addresses.
      trustEmail: process.env.OIDC_TRUST_EMAIL === 'true',
    };
  })(),

  // SSO-only mode: refuse password login/registration. Callers must combine
  // this with oidc.enabled — the flag is ignored while OIDC is off so a stray
  // env var can never lock out every way of signing in.
  auth: {
    passwordLoginDisabled: process.env.DISABLE_PASSWORD_LOGIN === 'true',
  },

  // Security controls for user-configured integration URLs (Immich, LLM, SMTP)
  security: {
    allowPrivateIntegrationUrls:
      process.env.ALLOW_PRIVATE_INTEGRATION_URLS === 'true' ||
      process.env.NODE_ENV === 'development',
  },

  // Web Push (VAPID) - push notifications are disabled gracefully when unset
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || '', // e.g. mailto:admin@example.com
  },

  // AI / LLM
  llm: {
    enabled: process.env.AI_ENABLED !== 'false',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '2048', 10),
  },

  // Saved-link email ingest (IMAP).
  // Inert unless user + password are set — see emailIngest.service.isConfigured().
  imap: {
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: parseInt(process.env.IMAP_PORT || '993', 10),
    user: process.env.IMAP_USER || '',
    // Gmail requires an App Password here; the account password will not work.
    password: process.env.IMAP_PASSWORD || '',
    // Gmail exposes "archive" as this folder. Processed mail is MOVED here.
    archiveFolder: process.env.IMAP_ARCHIVE_FOLDER || '[Gmail]/All Mail',
    pollCron: process.env.IMAP_POLL_CRON || '*/5 * * * *',
    maxLinksPerMessage: parseInt(process.env.IMAP_MAX_LINKS || '20', 10),
  },
};

export default config;
