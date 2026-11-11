# Backend — Environment Variables

### Required

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/travel_life?schema=public
JWT_SECRET=<strong-secret>
JWT_REFRESH_SECRET=<strong-secret>
NOMINATIM_URL=http://localhost:8080
```

Since 6.0.0 both JWT secrets are validated at startup: **at least 32 characters** and not a
well-known placeholder (`changeme`, `secret`, …). The backend exits with `JWT_SECRET is too
weak` rather than starting. Generate them with `openssl rand -base64 48`. Enforced in
development and production; skipped only under `NODE_ENV=test` so fixture secrets keep
working. Changing either secret invalidates all sessions and refresh tokens.

### Recommended

- `OPENROUTESERVICE_API_KEY` - **For accurate road distance calculations (car/bike/walking)**. Without this, distances fall back to straight-line (Haversine) calculations. See [ROUTING_SETUP.md](../docs/guides/ROUTING_SETUP.md)

### Optional

- `IMMICH_API_URL` and `IMMICH_API_KEY` - For Immich integration
- `OPENWEATHERMAP_API_KEY` - For weather data
- `AVIATIONSTACK_API_KEY` - For flight tracking
- `AI_ENABLED` - Enables AI features such as PDF import and AI suggestions (set to `false` to disable; defaults to enabled)
- `LLM_API_KEY` - API key for the LLM provider (powers PDF import and AI suggestions)
- `LLM_BASE_URL` - LLM API base URL (defaults to `https://api.openai.com/v1`)
- `LLM_MODEL` - LLM model name (defaults to `gpt-4o-mini`)
- `LLM_MAX_TOKENS` - Maximum tokens per LLM request (defaults to `2048`)
- `AI_RATE_LIMIT_MAX` - Maximum AI requests per window (defaults to `20`)
- `AI_RATE_LIMIT_WINDOW_MS` - AI rate limit window in milliseconds (defaults to `3600000`)
- `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID` - Enable OAuth/OIDC single sign-on (works with Google, Authentik, Keycloak, or any OIDC provider). Register `<BASE_URL>/api/auth/oidc/callback` as the redirect URI with the provider. PKCE (S256) is always used
- `OIDC_CLIENT_SECRET` - Client secret for confidential clients; omit for public clients (PKCE-only)
- `OIDC_REDIRECT_URL` - Override the OIDC callback URL (defaults to `<BASE_URL>/api/auth/oidc/callback`)
- `OIDC_SCOPES` - OIDC scopes to request (defaults to `openid profile email`)
- `OIDC_BUTTON_TEXT` - Label for the SSO button on the login page (defaults to `Sign in with SSO`)
- `OIDC_AUTO_PROVISION` - Create accounts automatically on first SSO sign-in (defaults to enabled; set to `false` to require an existing account). `FRONTEND_URL` must point at the app for post-login redirects
- `OIDC_TRUST_EMAIL` - Set to `true` to allow linking to an existing account by email when the IdP omits the `email_verified` claim entirely (e.g. some self-hosted providers). An explicit `email_verified: false` is always rejected. Only enable when you fully control the IdP
- `EXCHANGE_RATE_API_URL` - Base URL for currency conversion rates (defaults to `https://api.frankfurter.dev/v1`). Frankfurter is free and needs no API key, so multi-currency budgets work out of the box; override only to point at a self-hosted instance. Rates are cached per (date, currency pair) in the `exchange_rates` table and never re-fetched, and a lookup that fails leaves the amount unconverted rather than erroring
- `DISABLE_PASSWORD_LOGIN` - Set to `true` for SSO-only mode: password login and registration are refused and hidden from the login page. Ignored unless OIDC is enabled (lockout guard)

### Scheduled backups

Off unless `BACKUP_SCHEDULE_ENABLED=true`. Writes one JSON backup per user to
`BACKUP_DIR/user-<id>/travel-life-backup-YYYY-MM-DD.json` and prunes old files.

- `BACKUP_DIR` - Target directory (defaults to `./backups`). Mount a volume or NAS path here. Files contain the user's stored API keys, so protect it like the database
- `BACKUP_CRON` - Schedule (defaults to `0 3 * * *`, nightly at 3am)
- `BACKUP_KEEP_DAILY` - Newest N daily files to keep (defaults to `7`)
- `BACKUP_KEEP_WEEKLY` - Additional one-per-week files kept beyond the daily window (defaults to `4`)

### Saved-link email ingest (IMAP)

Forward a link to the ingest mailbox and it lands in your saved-links inbox. The
feature is entirely inert unless `IMAP_USER` and `IMAP_PASSWORD` are both set.

```bash
IMAP_USER=travellifecc@gmail.com
IMAP_PASSWORD=<16-char Gmail App Password, no spaces>
```

- `IMAP_HOST` - IMAP server (defaults to `imap.gmail.com`)
- `IMAP_PORT` - IMAP port (defaults to `993`, TLS)
- `IMAP_USER` - The ingest mailbox address. **Enables the feature together with `IMAP_PASSWORD`**
- `IMAP_PASSWORD` - For Gmail this must be an **App Password**, not the account password. Requires 2-Step Verification on the account, generated at <https://myaccount.google.com/apppasswords>. Also confirm IMAP is enabled under Gmail → Settings → Forwarding and POP/IMAP
- `IMAP_ARCHIVE_FOLDER` - Where processed mail is moved (defaults to `[Gmail]/All Mail`, i.e. Gmail's archive). Processed mail is **moved, not deleted**
- `IMAP_POLL_CRON` - Poll schedule (defaults to `*/5 * * * *`)
- `IMAP_MAX_LINKS` - Max links captured per message (defaults to `20`)

**Sender verification:** a message is only accepted when its `From` matches a
user's account email or one of their trusted addresses (Settings → Link Ingest).
Everything else is recorded as `REJECTED_SENDER` and archived. A `From` header is
forgeable, so treat the mailbox address itself as the secret.
