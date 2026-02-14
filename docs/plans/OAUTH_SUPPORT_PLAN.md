# OAuth / OpenID Connect (OIDC) Support Plan

## Overview

Add support for external OAuth 2.0 / OpenID Connect identity providers so users can log in with their own self-hosted auth solutions (e.g., **Authelia**, **Pocket ID**) or any standards-compliant OIDC provider.

OAuth becomes an **alternative authentication method** alongside the existing username/password system. The current JWT-based session management remains unchanged — OAuth simply provides another way to obtain a JWT.

### Goals

- Support any generic OIDC-compliant provider via configuration (not hardcoded to a specific vendor)
- Allow a single OIDC provider configured at the instance level (self-hosted personal use)
- Auto-provision users on first OAuth login (no separate registration step)
- Allow existing password-based users to link their OAuth identity
- Optionally disable password-based login entirely (OAuth-only mode)
- Preserve all existing auth security (CSRF, httpOnly cookies, token blacklisting)

### Non-Goals (Out of Scope)

- Multiple simultaneous OAuth providers (Google + GitHub + Authelia, etc.)
- Social login buttons (Google, Facebook, GitHub) — can be added later using this same foundation
- OAuth as a service (this app is not an OAuth provider, only a consumer)

---

## Current Auth Architecture

**Flow:** Email/Password → bcrypt verify → JWT access token (15min) + refresh token (7d httpOnly cookie)

**Key files:**

| Layer | File | Role |
|-------|------|------|
| Config | `backend/src/config/index.ts` | JWT secrets, cookie settings |
| Types | `backend/src/types/auth.types.ts` | Zod schemas, JwtPayload, AuthResponse |
| Utils | `backend/src/utils/jwt.ts` | Token generation/verification |
| Utils | `backend/src/utils/cookies.ts` | Refresh token cookie management |
| Utils | `backend/src/utils/csrf.ts` | CSRF token + validation middleware |
| Utils | `backend/src/utils/password.ts` | bcrypt hash/compare |
| Service | `backend/src/services/auth.service.ts` | Register, login, refresh, getCurrentUser |
| Controller | `backend/src/controllers/auth.controller.ts` | HTTP handlers, cookie setting |
| Routes | `backend/src/routes/auth.routes.ts` | Route definitions |
| Middleware | `backend/src/middleware/auth.ts` | JWT verification middleware |
| Schema | `backend/prisma/schema.prisma` | User model (passwordHash required) |
| Frontend Store | `frontend/src/store/authStore.ts` | Zustand auth state |
| Frontend Service | `frontend/src/services/auth.service.ts` | API calls |
| Frontend Axios | `frontend/src/lib/axios.ts` | Interceptors, token refresh |
| Frontend Pages | `frontend/src/pages/LoginPage.tsx` | Login form |
| Frontend Pages | `frontend/src/pages/RegisterPage.tsx` | Registration form |

---

## How Authelia and Pocket ID Work

Both Authelia and Pocket ID implement **OpenID Connect (OIDC)**, which is an identity layer on top of OAuth 2.0. The flow is:

1. **App redirects user** to the OIDC provider's authorization endpoint
2. **User authenticates** at the provider (password, 2FA, etc.)
3. **Provider redirects back** to the app with an authorization code
4. **App exchanges code** for tokens (access token + ID token) via the provider's token endpoint
5. **App reads ID token** (JWT) to get user identity (email, name, sub)
6. **App creates a local session** (our existing JWT system)

This is the standard **Authorization Code Flow** — the most secure for server-side apps.

### OIDC Discovery

Both providers support **OIDC Discovery** (`.well-known/openid-configuration`), which means we only need the issuer URL — all endpoints are auto-discovered:

```
GET https://auth.example.com/.well-known/openid-configuration
→ {
    "authorization_endpoint": "https://auth.example.com/api/oidc/authorization",
    "token_endpoint": "https://auth.example.com/api/oidc/token",
    "userinfo_endpoint": "https://auth.example.com/api/oidc/userinfo",
    "jwks_uri": "https://auth.example.com/jwks.json",
    ...
  }
```

---

## Implementation Plan

### Phase 1: Database Schema Changes

**Goal:** Allow users to exist without passwords, and store OAuth identity links.

#### 1.1 Modify User Model

Make `passwordHash` optional to support OAuth-only users:

```prisma
model User {
  // ... existing fields ...
  passwordHash       String?  @map("password_hash") @db.VarChar(255)  // Changed: now optional
  // ... rest unchanged ...
}
```

#### 1.2 New OAuthIdentity Model

Store the link between local users and their OIDC identity:

```prisma
model OAuthIdentity {
  id             Int      @id @default(autoincrement())
  userId         Int      @map("user_id")
  provider       String   @db.VarChar(100)   // e.g., "authelia", "pocketid", or issuer URL
  subject        String   @db.VarChar(500)   // OIDC "sub" claim (unique user ID at the provider)
  email          String?  @db.VarChar(255)   // Email from the provider (for display/matching)
  displayName    String?  @map("display_name") @db.VarChar(255)
  rawClaims      Json?    @map("raw_claims")             // Full OIDC claims for debugging
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, subject])  // One identity per provider per subject
  @@index([userId])
  @@map("oauth_identities")
}
```

> **Decision:** Provider access/refresh tokens are **not stored**. They are only needed during the initial code exchange and are discarded after extracting user claims. This eliminates the risk of token leakage if the database is compromised. If a future feature requires calling the provider's API on behalf of the user, encrypted token storage can be added then.

Add relation to User:

```prisma
model User {
  // ... existing relations ...
  oauthIdentities OAuthIdentity[]
}
```

#### 1.3 Migration

```bash
npx prisma migrate dev --name add_oauth_support
```

This migration:
- Makes `password_hash` nullable
- Creates the `oauth_identities` table
- No data loss — existing users keep their password hashes

---

### Phase 2: Backend Configuration

**Goal:** Add OIDC provider configuration via environment variables.

#### 2.1 Environment Variables

Add to `.env`:

```env
# Cookie signing secret (required for OAuth — used by cookie-parser for signed cookies)
# Can reuse JWT_SECRET or generate a separate random value
COOKIE_SECRET=your-cookie-signing-secret

# OAuth / OIDC Configuration (optional - enables OAuth login)
OAUTH_ENABLED=true
OAUTH_PROVIDER_NAME=Authelia           # Display name for the login button
OAUTH_ISSUER_URL=https://auth.example.com  # OIDC issuer (must support .well-known/openid-configuration)
OAUTH_CLIENT_ID=travel-life
OAUTH_CLIENT_SECRET=your-client-secret
OAUTH_SCOPES=openid profile email      # Space-separated OIDC scopes
OAUTH_CALLBACK_URL=https://travel.example.com/api/auth/oauth/callback

# Optional behavior flags
OAUTH_AUTO_REGISTER=true               # Auto-create users on first OAuth login
OAUTH_DISABLE_PASSWORD_LOGIN=false     # Set to true for OAuth-only mode
OAUTH_ALLOW_ACCOUNT_LINKING=true       # Allow linking OAuth to existing accounts (requires email_verified claim)
```

#### 2.2 Config Module Update

Add to `backend/src/config/index.ts`:

```typescript
// Cookie signing secret (used by cookie-parser for signed cookies)
cookie: {
  // ... existing cookie config ...
  secret: process.env.COOKIE_SECRET || process.env.JWT_SECRET,  // NEW — required for signed OAuth state cookies
},

// OAuth / OIDC
oauth: {
  enabled: process.env.OAUTH_ENABLED === 'true',
  providerName: process.env.OAUTH_PROVIDER_NAME || 'SSO',
  issuerUrl: process.env.OAUTH_ISSUER_URL || '',
  clientId: process.env.OAUTH_CLIENT_ID || '',
  clientSecret: process.env.OAUTH_CLIENT_SECRET || '',
  scopes: (process.env.OAUTH_SCOPES || 'openid profile email').split(' '),
  callbackUrl: process.env.OAUTH_CALLBACK_URL || '',
  autoRegister: process.env.OAUTH_AUTO_REGISTER !== 'false',  // default true
  disablePasswordLogin: process.env.OAUTH_DISABLE_PASSWORD_LOGIN === 'true',
  allowAccountLinking: process.env.OAUTH_ALLOW_ACCOUNT_LINKING !== 'false',  // default true
},
```

Update `backend/src/index.ts` to pass cookie secret to cookie-parser:

```typescript
// BEFORE:  app.use(cookieParser());
// AFTER:
app.use(cookieParser(config.cookie.secret));
```

#### 2.3 Startup Validation

Fail fast with a clear error if required OAuth env vars are missing when `OAUTH_ENABLED=true`:

```typescript
// In config/index.ts, after config object definition:
if (config.oauth.enabled) {
  const required = ['OAUTH_ISSUER_URL', 'OAUTH_CLIENT_ID', 'OAUTH_CLIENT_SECRET', 'OAUTH_CALLBACK_URL'];
  for (const varName of required) {
    if (!process.env[varName]) {
      throw new Error(`${varName} is required when OAUTH_ENABLED=true`);
    }
  }
}
```

---

### Phase 3: Backend OIDC Service

**Goal:** Implement the OIDC client logic using the `openid-client` library.

#### 3.1 Dependencies

```bash
cd backend
npm install openid-client
```

The [`openid-client`](https://github.com/panva/openid-client) library is the standard Node.js OIDC client — it handles discovery, token exchange, ID token validation, and JWKS verification automatically.

#### 3.2 New Service: `backend/src/services/oauth.service.ts`

Responsibilities:

| Method | Purpose |
|--------|---------|
| `initialize()` | Discover OIDC endpoints from issuer URL, cache config |
| `getAuthorizationUrl(state, nonce)` | Build the provider's login URL with PKCE |
| `handleCallback(code, state, nonce)` | Exchange authorization code for tokens, validate ID token |
| `findOrCreateUser(claims)` | Match OIDC identity to existing user or auto-create |
| `linkIdentity(userId, claims)` | Link OIDC identity to an existing user account |
| `unlinkIdentity(userId, provider)` | Remove OAuth link (only if user has a password set) |

**Key implementation details:**

```typescript
// Initialization (called once at startup)
// Uses openid-client v6 — top-level function imports, NOT the v5 Issuer/Client pattern
import {
  discovery,
  buildAuthorizationUrl,
  authorizationCodeGrant,
  calculatePKCECodeChallenge,   // NOTE: this is async in v6
  randomPKCECodeVerifier,        // NOTE: replaces generators.codeVerifier() from v5
  type Configuration,
} from 'openid-client';

let oidcConfig: Configuration | null = null;

async function initialize(): Promise<void> {
  if (!config.oauth.enabled) return;

  try {
    oidcConfig = await discovery(
      new URL(config.oauth.issuerUrl),
      config.oauth.clientId,
      config.oauth.clientSecret
    );
    logger.info('OIDC provider discovered successfully');
  } catch (error) {
    logger.error('OIDC discovery failed. OAuth login will be unavailable until provider is reachable.', error);
    // Don't throw — allow server to start so password login still works
    oidcConfig = null;
  }
}

// Generate authorization URL
// NOTE: async because calculatePKCECodeChallenge returns a Promise in openid-client v6
async function getAuthorizationUrl(state: string, nonce: string, codeVerifier: string): Promise<string> {
  if (!oidcConfig) {
    throw new AppError('OAuth provider is currently unavailable. Please try again later.', 503);
  }

  const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);  // MUST await

  const params = buildAuthorizationUrl(oidcConfig, {
    redirect_uri: config.oauth.callbackUrl,
    scope: config.oauth.scopes.join(' '),
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return params.href;
}

// Exchange code for tokens
async function handleCallback(
  code: string,
  expectedState: string,
  expectedNonce: string,
  codeVerifier: string
): Promise<OAuthUserInfo> {
  if (!oidcConfig) {
    throw new AppError('OAuth provider is currently unavailable.', 503);
  }

  const currentUrl = new URL(`${config.oauth.callbackUrl}?code=${code}&state=${expectedState}`);

  const tokens = await authorizationCodeGrant(oidcConfig, currentUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedNonce,        // openid-client validates nonce in the ID token automatically
    expectedState,
  });

  const claims = tokens.claims();
  // claims contains: sub, email, name, preferred_username, etc.

  // Validate required claims before trusting them
  if (!claims.sub || typeof claims.sub !== 'string') {
    throw new AppError('OIDC provider returned invalid identity (missing sub claim)', 502);
  }
  if (claims.email && typeof claims.email !== 'string') {
    throw new AppError('OIDC provider returned invalid email claim', 502);
  }

  return {
    subject: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : undefined,
    emailVerified: claims.email_verified === true,  // Needed for safe account linking
    name: (claims.name || claims.preferred_username) as string | undefined,
    rawClaims: claims,
  };
}
```

#### 3.3 User Matching Logic

When an OIDC callback arrives, resolve to a local user:

```text
1. Look up OAuthIdentity by (provider, subject)
   → Found: return existing user

2. If OAUTH_ALLOW_ACCOUNT_LINKING is true
   AND claims.email_verified is true:
   Look up User by email (from OIDC claims)
   → Found: create OAuthIdentity linking to this user, return user

3. If OAUTH_AUTO_REGISTER is true:
   Create new User (no passwordHash) + OAuthIdentity, return user

4. Otherwise: return error "No account found. Contact administrator."
```

> **Security note — email-based account linking:** Step 2 **requires** the OIDC provider to assert `email_verified: true` in the ID token claims. Without this check, an attacker could register at a permissive OIDC provider using a victim's email and take over their account. If `email_verified` is `false` or missing, skip step 2 and fall through to step 3 (auto-register as a new user) or step 4 (reject).

**Important:** When auto-creating users in step 3, replicate the same initialization as the existing registration flow in `auth.service.ts`:

```typescript
// In findOrCreateUser(), when creating a new OAuth user:
const user = await prisma.$transaction(async (tx) => {
  const newUser = await tx.user.create({
    data: {
      username: claims.name || claims.email?.split('@')[0] || `user_${claims.subject.slice(0, 8)}`,
      email: claims.email || `${claims.subject}@oauth.local`,
      passwordHash: null,  // OAuth-only user, no password
      oauthIdentities: {
        create: {
          provider: config.oauth.issuerUrl,
          subject: claims.subject,
          email: claims.email,
          displayName: claims.name,
          rawClaims: claims.rawClaims,
        },
      },
    },
  });

  // Create default "Myself" companion (same as password registration)
  await companionService.createMyselfCompanion(newUser.id, newUser.username);

  return newUser;
});
```

---

### Phase 4: Backend Routes & Controller

**Goal:** Add OAuth-specific API endpoints.

#### 4.1 New Routes: `backend/src/routes/oauth.routes.ts`

```
GET  /api/auth/oauth/config       → Public. Returns { enabled, providerName, disablePasswordLogin }
GET  /api/auth/oauth/authorize     → Generates auth URL, stores state/nonce in session cookie, redirects
GET  /api/auth/oauth/callback      → Handles provider redirect, exchanges code, issues JWT session
POST /api/auth/oauth/link          → Authenticated. Links OAuth identity to current user
POST /api/auth/oauth/unlink        → Authenticated. Removes OAuth link (requires password set)
```

#### 4.2 Controller: `backend/src/controllers/oauth.controller.ts`

**Config endpoint** (public, no auth required):

```typescript
async getConfig(req: Request, res: Response) {
  res.json({
    status: 'success',
    data: {
      enabled: config.oauth.enabled,
      providerName: config.oauth.providerName,
      disablePasswordLogin: config.oauth.disablePasswordLogin,
    },
  });
}
```

**Authorize endpoint** (initiates OAuth flow):

```typescript
async authorize(req: Request, res: Response) {
  // 1. Generate cryptographic state, nonce, and PKCE code_verifier
  const state = crypto.randomBytes(32).toString('hex');
  const nonce = crypto.randomBytes(32).toString('hex');
  const codeVerifier = randomPKCECodeVerifier();  // openid-client v6 function (NOT generators.codeVerifier)

  // 2. Store state + nonce + codeVerifier in a short-lived httpOnly cookie
  //    (signed, 10 min expiry — requires cookie-parser initialized with a secret)
  res.cookie('oauth_state', JSON.stringify({ state, nonce, codeVerifier }), {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: 'lax',  // Must be 'lax' for OAuth redirects to work
    maxAge: 10 * 60 * 1000,  // 10 minutes
    signed: true,
  });

  // 3. Redirect to OIDC provider (getAuthorizationUrl is async — PKCE challenge calculation)
  const url = await oauthService.getAuthorizationUrl(state, nonce, codeVerifier);
  res.redirect(url);
}
```

**Callback endpoint** (handles provider redirect):

```typescript
async callback(req: Request, res: Response) {
  // 1. Extract code and state from query params
  const { code, state, error } = req.query;
  if (error) {
    return res.redirect(`${config.frontendUrl}/login?error=oauth_denied`);
  }

  // 2. Retrieve and validate state from signed cookie
  const oauthStateCookie = req.signedCookies?.oauth_state;
  if (!oauthStateCookie) {
    return res.redirect(`${config.frontendUrl}/login?error=oauth_expired`);
  }

  const stored = JSON.parse(oauthStateCookie);
  if (state !== stored.state) {
    return res.redirect(`${config.frontendUrl}/login?error=oauth_state_mismatch`);
  }

  // 3. Clear the state cookie
  res.clearCookie('oauth_state');

  // 4. Exchange code for tokens + validate (nonce validated by openid-client automatically)
  const userInfo = await oauthService.handleCallback(
    code as string, stored.state, stored.nonce, stored.codeVerifier
  );

  // 5. Find or create local user
  const user = await oauthService.findOrCreateUser(userInfo);

  // 6. Issue local JWT session — MUST include passwordVersion (auth middleware checks it)
  const accessToken = generateAccessToken({
    id: user.id,
    userId: user.id,
    email: user.email,
    passwordVersion: user.passwordVersion ?? 0,
  });
  const refreshToken = generateRefreshToken({
    id: user.id,
    userId: user.id,
    email: user.email,
    passwordVersion: user.passwordVersion ?? 0,
  });

  // 7. Set refresh token cookie + CSRF cookie (reuse existing helpers)
  setRefreshTokenCookie(res, refreshToken);
  const csrfToken = generateCsrfToken();   // Must generate token first
  setCsrfCookie(res, csrfToken);           // setCsrfCookie requires (res, token)

  // 8. Redirect to frontend with access token in URL fragment
  //    Fragment (#) is never sent to the server, preventing referer leaks and server-side logging.
  //    Frontend reads it from window.location.hash and clears it immediately.
  res.redirect(`${config.frontendUrl}/oauth/callback#access_token=${accessToken}`);
}
```

#### 4.3 Security Considerations

| Concern | Mitigation |
|---------|------------|
| CSRF during OAuth flow | `state` parameter validated against signed cookie |
| Replay attacks | `nonce` validated in ID token by openid-client |
| Code interception | PKCE (S256) prevents authorization code theft |
| Token exposure in URL | Access token in URL fragment (`#`) — never sent to servers, not logged |
| State cookie tampering | Cookie is signed (`signed: true`, requires `COOKIE_SECRET`) |
| Open redirect | Callback URL is hardcoded in config, not from user input |
| Account takeover via email | Account linking only when provider asserts `email_verified: true` |
| Provider token leakage | Provider tokens discarded after claim extraction, not stored in DB |
| OIDC claim injection | Claims validated (required `sub`, typed checks) before DB storage |
| Rate limiting | OAuth endpoints rate-limited (10 req/min authorize, 20 req/min callback) |

#### 4.4 Register Routes

In `backend/src/index.ts`, the OAuth routes are registered under the existing auth prefix:

```typescript
import oauthRoutes from './routes/oauth.routes';

// After existing auth routes
if (config.oauth.enabled) {
  app.use('/api/auth/oauth', oauthRoutes);
}
```

**CSRF middleware note:** No changes needed to `csrf.ts`. The existing middleware already:

- Skips GET/HEAD/OPTIONS requests (covers `/authorize` and `/callback` which are both GET)
- Skips all paths starting with `/auth/` (covers `/auth/oauth/*`)

The OAuth `POST /link` and `POST /unlink` endpoints are authenticated and will be validated by CSRF normally, which is correct — they require the user's CSRF token from their active session.

**Rate limiting:** Add rate limiting to OAuth routes:

```typescript
// In oauth.routes.ts
import rateLimit from 'express-rate-limit';

const oauthRateLimit = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 10,              // 10 requests per minute per IP for authorize
  message: { status: 'error', message: 'Too many OAuth requests. Try again later.' },
});

router.get('/authorize', oauthRateLimit, oauthController.authorize);
router.get('/callback', rateLimit({ windowMs: 60_000, max: 20 }), oauthController.callback);
```

---

### Phase 5: Modify Existing Auth Service

**Goal:** Adjust existing auth to work alongside OAuth.

#### 5.1 Login & Registration Guard

If `OAUTH_DISABLE_PASSWORD_LOGIN=true`, reject both password login and registration:

```typescript
// In auth.service.ts login()
if (config.oauth.disablePasswordLogin) {
  throw new AppError('Password login is disabled. Please use SSO.', 403);
}

// In auth.service.ts register()
if (config.oauth.disablePasswordLogin) {
  throw new AppError('Password registration is disabled. Please use SSO.', 403);
}
```

Also block the `updatePassword` endpoint for OAuth-only users (no passwordHash):

```typescript
// In user.service.ts updatePassword()
const user = await prisma.user.findUnique({ where: { id: userId } });
if (!user?.passwordHash) {
  throw new AppError('Cannot change password for an SSO-only account. Set a password first via account settings.', 400);
}
```

#### 5.2 Password Requirement Changes

When a user was created via OAuth (no `passwordHash`), they cannot use password-based endpoints.

**IMPORTANT:** Check for null `passwordHash` BEFORE calling `comparePassword()`, otherwise `comparePassword(password, null)` will throw an unhandled error:

```typescript
// In auth.service.ts login() — MUST check passwordHash before comparePassword
const user = await prisma.user.findUnique({ where: { email } });
if (!user) throw new AppError('Invalid email or password', 401);

// Check FIRST — OAuth-only users have no passwordHash
if (!user.passwordHash) {
  throw new AppError('This account uses SSO login. Please log in with your identity provider.', 403);
}

// Now safe to compare
const isPasswordValid = await comparePassword(data.password, user.passwordHash);
if (!isPasswordValid) {
  throw new AppError('Invalid email or password', 401);
}
```

#### 5.3 OAuth Unlink Guard

Don't allow unlinking OAuth if the user has no password set:

```typescript
// In oauth.service.ts unlinkIdentity()
const user = await prisma.user.findUnique({ where: { id: userId } });
if (!user.passwordHash) {
  throw new AppError('Cannot unlink OAuth — set a password first.', 400);
}
```

---

### Phase 6: Frontend Changes

**Goal:** Add OAuth login flow to the frontend.

#### 6.1 New Config Query

Fetch OAuth config on app initialization to know whether to show OAuth button:

**New file:** `frontend/src/services/oauth.service.ts`

```typescript
class OAuthService {
  async getConfig(): Promise<OAuthConfig> {
    const response = await axios.get('/auth/oauth/config');
    return response.data.data;
  }
}

export interface OAuthConfig {
  enabled: boolean;
  providerName: string;
  disablePasswordLogin: boolean;
}
```

**Config loading timing:** Fetch OAuth config early in the app lifecycle to avoid a flash of password-only UI. Add to `authStore.ts`:

```typescript
// In authStore.ts — add oauthConfig state
interface AuthState {
  // ... existing fields ...
  oauthConfig: OAuthConfig | null;
  fetchOAuthConfig: () => Promise<void>;
}

// Fetch on app initialization (parallel with initializeAuth)
fetchOAuthConfig: async () => {
  try {
    const config = await oauthService.getConfig();
    set({ oauthConfig: config });
  } catch {
    // OAuth config unavailable — password login only
    set({ oauthConfig: { enabled: false, providerName: '', disablePasswordLogin: false } });
  }
},
```

Call `fetchOAuthConfig()` in `App.tsx` `useEffect` alongside `initializeAuth()`.

#### 6.2 Login Page Changes

Modify `frontend/src/pages/LoginPage.tsx`:

```
┌──────────────────────────────────────┐
│           Travel Life Login          │
│                                      │
│  ┌──────────────────────────────┐    │
│  │  🔑  Sign in with Authelia   │    │  ← OAuth button (if enabled)
│  └──────────────────────────────┘    │
│                                      │
│  ──────────── or ─────────────       │  ← Divider (if both methods active)
│                                      │
│  Email:    [________________]        │  ← Password form
│  Password: [________________]        │     (hidden if disablePasswordLogin)
│  [         Sign In          ]        │
│                                      │
│  Don't have an account? Register     │  ← Hidden if disablePasswordLogin
└──────────────────────────────────────┘
```

**OAuth button behavior:**

```typescript
const handleOAuthLogin = () => {
  // Full-page redirect to backend, which redirects to OIDC provider
  window.location.href = `${import.meta.env.VITE_API_URL}/auth/oauth/authorize`;
};
```

#### 6.3 OAuth Callback Page

**New file:** `frontend/src/pages/OAuthCallbackPage.tsx`

This page handles the redirect back from the OAuth flow. The access token arrives in the URL fragment (`#access_token=xxx`), which is never sent to the server.

```typescript
export default function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { initializeAuth } = useAuthStore();

  useEffect(() => {
    // 1. Read the access token from the URL fragment (hash)
    //    Fragment is never sent to the server, preventing referer leaks
    const hash = window.location.hash.substring(1);  // Remove the '#'
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');

    // 2. Clear the fragment immediately to prevent token from lingering in browser history
    window.history.replaceState(null, '', window.location.pathname);

    // 3. Check for error query params (set by backend on OAuth failure)
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');

    if (token) {
      // 4. Store in memory (same as normal login)
      setAccessToken(token);

      // 5. Initialize auth state (fetches user profile)
      initializeAuth().then(() => {
        navigate('/dashboard', { replace: true });
      });
    } else {
      // No token — redirect to login with error
      const errorMsg = error || 'oauth_failed';
      navigate(`/login?error=${errorMsg}`, { replace: true });
    }
  }, []);

  return <LoadingSpinner message="Completing sign-in..." />;
}
```

#### 6.4 Route Registration

Add to `frontend/src/App.tsx` as a **public route** (outside `<ProtectedRoute>`), since the user isn't authenticated yet when the callback fires:

```typescript
{/* Public routes */}
<Route path="/login" element={<LoginPage />} />
<Route path="/register" element={<RegisterPage />} />
<Route path="/oauth/callback" element={<OAuthCallbackPage />} />  {/* Must be public */}
```

#### 6.5 Register Page Changes

- If `disablePasswordLogin` is true, redirect to login page (which shows OAuth button only)
- If OAuth is enabled but password login is also allowed, show both options

#### 6.6 Settings Page — Account Linking

Add an "Account Linking" section to the user settings page:

```
┌──────────────────────────────────────┐
│  Linked Accounts                     │
│                                      │
│  Authelia    user@example.com        │
│              [Unlink]                │  ← Only if user has a password
│                                      │
│  ─── or ───                          │
│                                      │
│  [Link Authelia Account]             │  ← If no OAuth identity linked
└──────────────────────────────────────┘
```

---

### Phase 7: Docker / Deployment Configuration

#### 7.1 Docker Compose Updates

Add OAuth environment variables to `docker-compose.yml` and `docker-compose.prod.yml`:

```yaml
travel-life-backend:
  environment:
    # ... existing vars ...
    - OAUTH_ENABLED=${OAUTH_ENABLED:-false}
    - OAUTH_PROVIDER_NAME=${OAUTH_PROVIDER_NAME:-SSO}
    - OAUTH_ISSUER_URL=${OAUTH_ISSUER_URL:-}
    - OAUTH_CLIENT_ID=${OAUTH_CLIENT_ID:-}
    - OAUTH_CLIENT_SECRET=${OAUTH_CLIENT_SECRET:-}
    - OAUTH_SCOPES=${OAUTH_SCOPES:-openid profile email}
    - OAUTH_CALLBACK_URL=${OAUTH_CALLBACK_URL:-}
    - OAUTH_AUTO_REGISTER=${OAUTH_AUTO_REGISTER:-true}
    - OAUTH_DISABLE_PASSWORD_LOGIN=${OAUTH_DISABLE_PASSWORD_LOGIN:-false}
    - OAUTH_ALLOW_ACCOUNT_LINKING=${OAUTH_ALLOW_ACCOUNT_LINKING:-true}
```

#### 7.2 Provider Setup Guides

Document configuration for the two target providers:

**Authelia:**

```env
OAUTH_ENABLED=true
OAUTH_PROVIDER_NAME=Authelia
OAUTH_ISSUER_URL=https://auth.example.com
OAUTH_CLIENT_ID=travel-life
OAUTH_CLIENT_SECRET=<generated-secret>
OAUTH_SCOPES=openid profile email
OAUTH_CALLBACK_URL=https://travel.example.com/api/auth/oauth/callback
```

Authelia `configuration.yml` addition:

```yaml
identity_providers:
  oidc:
    clients:
      - client_id: travel-life
        client_name: Travel Life
        client_secret: '<hashed-secret>'
        redirect_uris:
          - https://travel.example.com/api/auth/oauth/callback
        scopes:
          - openid
          - profile
          - email
        authorization_policy: two_factor  # or one_factor
```

**Pocket ID:**

```env
OAUTH_ENABLED=true
OAUTH_PROVIDER_NAME=Pocket ID
OAUTH_ISSUER_URL=https://id.example.com
OAUTH_CLIENT_ID=<pocket-id-client-id>
OAUTH_CLIENT_SECRET=<pocket-id-client-secret>
OAUTH_SCOPES=openid profile email
OAUTH_CALLBACK_URL=https://travel.example.com/api/auth/oauth/callback
```

#### 7.3 Backup & Restore Updates

The backup/restore system must handle OAuth data:

- **Backup:** Include `OAuthIdentity` records in user backup data (alongside trips, companions, etc.)
- **Restore:** Handle users with `passwordHash: null` — don't reject them as invalid
- **Cross-instance restore:** Document that OAuth identities are tied to a specific OIDC provider. Restoring to an instance with a different provider will leave OAuth links non-functional (but the user account and all data will restore correctly).

```typescript
// In backup.service.ts — add to user data export:
const user = await prisma.user.findUnique({
  where: { id: userId },
  include: {
    // ... existing includes ...
    oauthIdentities: {
      select: { provider: true, subject: true, email: true, displayName: true },
    },
  },
});

// In restore.service.ts — handle nullable passwordHash:
// Don't reject users where passwordHash is null (they're OAuth-only users)
```

---

## Implementation Sequence

| Order | Phase | Effort | Dependencies |
|-------|-------|--------|--------------|
| 1 | Phase 1 — Database schema | Small | None |
| 2 | Phase 2 — Backend config | Small | Phase 1 |
| 3 | Phase 3 — OIDC service | Medium | Phase 2 |
| 4 | Phase 4 — Routes & controller | Medium | Phase 3 |
| 5 | Phase 5 — Modify existing auth | Small | Phase 4 |
| 6 | Phase 6 — Frontend changes | Medium | Phase 4 |
| 7 | Phase 7 — Docker/deployment | Small | Phase 2 |

**Estimated total effort:** 2-3 focused implementation sessions.

Phases 6 and 7 can be done in parallel once Phase 4 is complete.

---

## Data Flow Diagram

```
                    OAUTH LOGIN FLOW
                    ================

  Browser                    Backend                    OIDC Provider
  ───────                    ───────                    ─────────────
     │                          │                            │
     │  Click "Sign in with     │                            │
     │  Authelia"               │                            │
     │─────────────────────────>│                            │
     │  GET /auth/oauth/        │                            │
     │      authorize           │                            │
     │                          │                            │
     │                          │  Generate state, nonce,    │
     │                          │  PKCE code_verifier        │
     │                          │  Store in signed cookie    │
     │                          │                            │
     │  302 Redirect            │                            │
     │<─────────────────────────│                            │
     │  + oauth_state cookie    │                            │
     │                          │                            │
     │  Follow redirect to      │                            │
     │  OIDC authorization      │                            │
     │──────────────────────────────────────────────────────>│
     │                          │                            │
     │                          │          User authenticates│
     │                          │          (password, 2FA)   │
     │                          │                            │
     │  302 Redirect to callback│                            │
     │<──────────────────────────────────────────────────────│
     │  ?code=xxx&state=yyy     │                            │
     │                          │                            │
     │  GET /auth/oauth/        │                            │
     │      callback            │                            │
     │─────────────────────────>│                            │
     │  + oauth_state cookie    │                            │
     │                          │  Validate state            │
     │                          │                            │
     │                          │  Exchange code for tokens  │
     │                          │───────────────────────────>│
     │                          │  POST /token               │
     │                          │<───────────────────────────│
     │                          │  {access_token, id_token}  │
     │                          │                            │
     │                          │  Validate ID token         │
     │                          │  Extract claims (sub,email)│
     │                          │                            │
     │                          │  Find or create local user │
     │                          │  Issue local JWT session   │
     │                          │                            │
     │  302 Redirect to         │                            │
     │  /oauth/callback         │                            │
     │<─────────────────────────│                            │
     │  + refresh_token cookie  │                            │
     │  + csrf cookie           │                            │
     │  + oauth_access_token    │                            │
     │    cookie (1 min)        │                            │
     │                          │                            │
     │  Frontend reads access   │                            │
     │  token, stores in memory,│                            │
     │  clears cookie           │                            │
     │                          │                            │
     │  Redirect to /dashboard  │                            │
     │                          │                            │
     ▼                          ▼                            ▼

         SUBSEQUENT REQUESTS: Identical to password login
         (Bearer token in header, refresh via httpOnly cookie)
```

---

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `backend/src/services/oauth.service.ts` | OIDC client logic (discovery, auth URL, code exchange, user matching) |
| `backend/src/controllers/oauth.controller.ts` | HTTP handlers for OAuth endpoints |
| `backend/src/routes/oauth.routes.ts` | Route definitions |
| `backend/src/types/oauth.types.ts` | TypeScript types and Zod schemas for OAuth |
| `frontend/src/pages/OAuthCallbackPage.tsx` | Handles redirect back from provider |
| `frontend/src/services/oauth.service.ts` | Frontend OAuth API client |
| `backend/prisma/migrations/xxx_add_oauth_support/` | Database migration |

### Modified Files

| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Make `passwordHash` optional, add `OAuthIdentity` model |
| `backend/src/config/index.ts` | Add `oauth` config section |
| `backend/src/index.ts` | Register OAuth routes |
| `backend/src/services/auth.service.ts` | Add password login guard, handle passwordless users |
| `backend/src/utils/csrf.ts` | No changes needed (existing `/auth/` exclusion covers OAuth routes) |
| `frontend/src/pages/LoginPage.tsx` | Add OAuth button, conditional password form |
| `frontend/src/pages/RegisterPage.tsx` | Hide when password login disabled |
| `frontend/src/App.tsx` | Add `/oauth/callback` route |
| `frontend/src/store/authStore.ts` | Handle OAuth config state |
| `backend/src/services/backup.service.ts` | Include `OAuthIdentity` in user backup data |
| `backend/src/services/restore.service.ts` | Handle restore of `OAuthIdentity` records and `passwordHash: null` users |
| `backend/src/services/user.service.ts` | Block `updatePassword` for OAuth-only users without existing password |
| `docker-compose.yml` | Add OAuth environment variables |
| `docker-compose.prod.yml` | Add OAuth environment variables |
| `.env.example` | Document OAuth variables |

---

## Testing Plan

### Manual Testing Checklist

**Basic flows:**

- [ ] OAuth disabled: app works exactly as before (no OAuth button, password login works)
- [ ] OAuth enabled + password enabled: both login methods visible and functional
- [ ] OAuth enabled + password disabled: only OAuth button shown, password endpoints return 403
- [ ] OAuth enabled + password disabled: registration endpoint also returns 403
- [ ] First OAuth login with auto-register: new user created, logged in, default "Myself" companion created
- [ ] Second OAuth login: existing user found by OIDC subject, logged in
- [ ] Account linking: existing password user logs in via OAuth, identity linked (only if `email_verified: true`)
- [ ] Account linking rejected: provider returns `email_verified: false`, creates new account instead of linking
- [ ] Account unlinking: user with password can unlink OAuth
- [ ] Account unlinking guard: OAuth-only user cannot unlink (must set password first)

**Security:**

- [ ] State mismatch: tampered state parameter rejected
- [ ] Expired state cookie: returns error, redirects to login with clear message
- [ ] Nonce mismatch: rejected by openid-client during token validation
- [ ] Provider down during OAuth flow: graceful error, redirects to login with error message
- [ ] Provider down at startup: server starts, password login works, OAuth shows 503
- [ ] Rate limiting: rapid OAuth requests are throttled
- [ ] CSRF: protected endpoints still validate CSRF for OAuth users

**Session management:**

- [ ] OAuth-initiated sessions work with existing refresh/logout flow
- [ ] OAuth user logout blacklists refresh token (same as password logout)
- [ ] File access: OAuth users can access uploaded files (existing auth middleware)
- [ ] OAuth-only user cannot call `updatePassword` endpoint

**Edge cases:**

- [ ] OAuth user starts flow in one browser, completes in another: state mismatch error
- [ ] User refreshes `/oauth/callback` page: handled gracefully (no token in fragment)
- [ ] Backup/restore: OAuth-only user data is preserved, OAuth links included
- [ ] Missing `OAUTH_ISSUER_URL` with `OAUTH_ENABLED=true`: server fails fast with clear error

### Integration Testing

- [ ] Test with Authelia instance
- [ ] Test with Pocket ID instance
- [ ] Test OIDC discovery with both providers
- [ ] Test token refresh flow after OAuth login
- [ ] Test concurrent sessions (password + OAuth for same user)
- [ ] Test password user changes email, then logs in via OAuth: still recognized by `subject` not email

---

## Migration & Rollback

### Forward Migration

1. Deploy database migration (add `oauth_identities` table, make `password_hash` nullable)
2. Deploy backend with OAuth disabled (`OAUTH_ENABLED=false`)
3. Deploy frontend (OAuth button hidden when disabled)
4. Configure OIDC provider (Authelia/Pocket ID client registration)
5. Enable OAuth (`OAUTH_ENABLED=true`) and set environment variables
6. Test OAuth flow end-to-end

### Rollback

1. Set `OAUTH_ENABLED=false` — immediately disables OAuth login
2. OAuth-only users (no password) will be locked out until re-enabled or a password is set manually
3. Database migration is backwards-compatible — existing users unaffected
4. No data loss on rollback

---

## Future Extensions

Once the generic OIDC foundation is in place, these become straightforward additions:

- **Multiple providers** — Change from single provider config to a provider registry (array of configs)
- **Social login** — Add Google/GitHub/Apple as pre-configured OIDC providers
- **Group/role mapping** — Map OIDC claims (groups) to application roles
- **Admin-managed users** — Admin can create OAuth-only accounts without passwords
- **Forced re-authentication** — Require fresh OIDC auth for sensitive operations (e.g., account deletion)

---

## Resolved Design Decisions

These were originally open questions, now resolved during plan review:

1. **Cookie signing secret** — **Resolved:** Add `COOKIE_SECRET` env var (falls back to `JWT_SECRET`). Pass it to `cookieParser(config.cookie.secret)` in `index.ts`. See Phase 2.2.

2. **Access token delivery** — **Resolved: URL fragment approach.** The backend callback redirects to `${frontendUrl}/oauth/callback#access_token=xxx`. Fragments are never sent to servers, preventing referer leaks and server-side logging. The frontend reads the token from `window.location.hash`, stores it in memory, and clears the fragment via `history.replaceState()`. See Phase 4.2 and Phase 6.3.

3. **User merge conflicts** — **Resolved: Require `email_verified: true` for auto-linking.** Account linking by email only happens when the OIDC provider asserts `email_verified: true` in the ID token claims. This prevents account takeover by an attacker who registers at a permissive provider using a victim's email. If `email_verified` is false or missing, the user is treated as a new account (auto-register) or rejected. See Phase 3.3 security note.

4. **Token storage encryption** — **Resolved: Don't store provider tokens.** Provider access/refresh tokens are discarded after extracting user claims during the initial code exchange. They're not needed after login since we issue our own JWT session. This eliminates the DB leakage risk entirely. If a future feature requires calling the provider's API on behalf of the user, encrypted storage (AES-256-GCM with a key from env var) can be added to the `OAuthIdentity` model then. See Phase 1.2.

---

## Appendix: Plan Review Findings

This plan was reviewed by three specialized agents for errors, missed items, and security concerns. All critical and high-priority findings have been incorporated into the plan above. Below are the medium/low items that were noted but deferred or documented as acceptable trade-offs.

### Accepted Limitations

| Item | Decision | Rationale |
| ---- | -------- | --------- |
| Single-server only (cookie-based state) | Documented limitation | Self-hosted personal app; multi-server would need Redis session store |
| No OIDC logout (RP-initiated) | Deferred to Future Extensions | Acceptable for Phase 1; provider session stays active after app logout |
| OAuth config endpoint leaks provider name | Acceptable | Non-sensitive info; needed for frontend to render correct button text |
| No OIDC claims sanitization for XSS | Handled by React | React auto-escapes rendered strings; `rawClaims` is JSON (not rendered directly) |
| 10-minute state cookie expiry | Acceptable | Standard timeout; clear error message on expiry guides user to retry |
| `passwordVersion` for OAuth-only users | Works as-is | OAuth users have `passwordVersion: 0` permanently; auth middleware check passes |
| OAuth logout uses existing `/api/auth/logout` | Works as-is | Existing endpoint blacklists refresh token, which is the same for OAuth sessions |

### Documentation Updates Needed at Implementation Time

When implementing this plan, also update:

- `README.md` — Add OAuth/SSO as a listed feature
- `CLAUDE.md` — Document `COOKIE_SECRET` and OAuth env vars in "Environment Setup" section
- `docs/architecture/BACKEND_ARCHITECTURE.md` — Document OAuth service, routes, `OAuthIdentity` table
- `docs/api/README.md` — Add OAuth endpoints (`/config`, `/authorize`, `/callback`, `/link`, `/unlink`)
- `DEPLOYMENT.md` — Add "OAuth/SSO Configuration" section with Authelia and Pocket ID examples
- `.env.example` — Add all OAuth environment variables with comments
- `docs/user-guide/README.md` — Add OAuth login instructions for end users

### Review Methodology

| Agent | Focus | Critical Findings | Incorporated |
| ----- | ----- | ----------------- | ------------ |
| Error Reviewer | API correctness, code bugs | 7 critical/high errors | All 7 fixed |
| Architecture Reviewer | Missing items, integration gaps | 5 high-priority gaps | All 5 addressed |
| Security Reviewer | Vulnerabilities, attack vectors | 1 critical + 3 high | All 4 mitigated |
