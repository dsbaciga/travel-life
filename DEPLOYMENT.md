# Production Deployment Guide

Comprehensive guide for deploying Travel Life to production environments.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Deployment Options](#deployment-options)
- [Standard Docker Deployment](#standard-docker-deployment)
- [TrueNAS Deployment](#truenas-deployment)
- [Environment Configuration](#environment-configuration)
- [Database Management](#database-management)
- [Reverse Proxy Setup](#reverse-proxy-setup)
- [SSL/TLS Configuration](#ssltls-configuration)
- [Backup and Recovery](#backup-and-recovery)
- [Monitoring](#monitoring)
- [Updating the Application](#updating-the-application)
- [Security Checklist](#security-checklist)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Reverse Proxy (nginx/Caddy)             │
│                        (SSL Termination)                    │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┴────────────────────┐
         │                                         │
         ▼                                         ▼
┌─────────────────┐                     ┌─────────────────┐
│    Frontend     │                     │     Backend     │
│   (nginx:80)    │                     │   (Node:5000)   │
│   Static SPA    │─────────────────────│   Express API   │
└─────────────────┘                     └─────────────────┘
                                                 │
                    ┌────────────────────────────┼────────────────────────────┐
                    │                            │                            │
                    ▼                            ▼                            ▼
         ┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
         │   PostgreSQL    │          │    Nominatim    │          │  Upload Volume  │
         │   (PostGIS)     │          │   (Geocoding)   │          │    (Photos)     │
         └─────────────────┘          └─────────────────┘          └─────────────────┘
```

## Deployment Options

### Option 1: Docker Compose (Recommended)

Best for: VPS, dedicated servers, home servers

```bash
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
```

### Option 2: TrueNAS Scale

Best for: TrueNAS users with existing infrastructure

See [TrueNAS Deployment](#truenas-deployment) section.

### Option 3: Kubernetes

Best for: Large-scale deployments, high availability requirements

Contact maintainers for Helm charts and K8s manifests.

## Standard Docker Deployment

### Prerequisites

- Docker Engine 20.10+
- Docker Compose v2+
- 4GB RAM minimum (8GB recommended)
- 20GB storage minimum

### Step 1: Prepare Environment

```bash
# Clone repository
git clone https://github.com/dsbaciga/travel-life.git
cd travel-life

# Create the production environment file from the template
cp .env.production.example .env.production
```

`.env.production.example` is the authoritative list of every variable
`docker-compose.prod.yml` consumes, with inline notes. Fill it in following
[Step 2](#step-2-configure-environment).

### Step 2: Configure Environment

At minimum, set these in `.env.production`:

```bash
# Database (the db service is not published to the host)
DB_USER=travel_life_user
DB_PASSWORD=<generate-strong-password>
DB_NAME=travel_life

# JWT secrets - generate each with: openssl rand -base64 48
# The stack refuses to start without them, and they must differ from each other.
JWT_SECRET=<random-string>
JWT_REFRESH_SECRET=<different-random-string>

# Public URLs - used for OIDC redirects, invitation links, and SSO returns.
# Must be externally reachable, not localhost.
BASE_URL=https://your-domain.com
FRONTEND_URL=https://your-domain.com

# Host ports - point your reverse proxy at FRONTEND_PORT
BACKEND_PORT=5000
FRONTEND_PORT=80

# Frontend API paths. The bundled nginx proxies /api and /uploads to the
# backend, so these relative defaults work behind any domain and avoid CORS.
# NOTE: build-time only - see the warning below.
VITE_API_URL=/api
VITE_UPLOAD_URL=/uploads
```

> **`VITE_*` variables are baked into the frontend bundle at image build time.**
> Changing them has no effect on a running container — you must rebuild:
> `docker-compose -f docker-compose.prod.yml --env-file .env.production build frontend`

Optional integrations (weather, flights, Immich, AI, SSO, push, email ingest)
are all listed in [Environment Configuration](#environment-configuration) below
and in the template. Each is inert until configured.

### Step 3: Build and Start

```bash
# Pull/build images
docker-compose -f docker-compose.prod.yml --env-file .env.production build

# Start services
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d

# Run migrations
docker exec travel-life-backend npx prisma migrate deploy
```

### Step 4: Verify Deployment

```bash
# Check all containers are running
docker ps

# Check backend health
curl http://localhost:5000/health

# Check frontend
curl -I http://localhost:80
```

## TrueNAS Deployment

### Using Pre-built Images

1. Navigate to **Apps** in TrueNAS Scale
2. Add custom app or use community catalog
3. Configure with these settings:

**Backend Container:**

- Image: `ghcr.io/dsbaciga/travel-life-backend:v5.6.1` (use an explicit version tag, not `latest`)
- Port: 5000
- Environment variables: (see above)

**Frontend Container:**

- Image: `ghcr.io/dsbaciga/travel-life-frontend:v5.6.1` (use an explicit version tag, not `latest`)
- Port: 80

**Database:**

- Use TrueNAS built-in PostgreSQL or external database

### TrueNAS-Optimized Compose

Use the TrueNAS-specific compose file:

```bash
docker-compose -f docker-compose.truenas.yml up -d
```

### Pinning the Deployed Version (`APP_VERSION`)

`docker-compose.truenas.yml` and `docker-compose.truenas.optimized.yml` deploy a pinned
image version rather than `:latest`, so a deploy is reproducible and a rollback is just a
matter of naming the previous tag:

```yaml
image: ghcr.io/dsbaciga/travel-life-backend:${APP_VERSION:-v5.6.1}
```

Set `APP_VERSION` per deploy, or put it in your env file:

```bash
# Deploy a specific release
APP_VERSION=v5.6.1 docker-compose -f docker-compose.truenas.yml pull
APP_VERSION=v5.6.1 docker-compose -f docker-compose.truenas.yml up -d

# Roll back to the previous release
APP_VERSION=v5.6.0 docker-compose -f docker-compose.truenas.yml up -d
```

If `APP_VERSION` is unset, the default baked into the compose file is used. Bump that
default when a release becomes the new baseline. Images are published by CI when a `v*`
tag is pushed, so only tagged versions are available — wait for the release workflow to
go green before deploying a brand-new version.

## Environment Configuration

Every variable below is read by `docker-compose.prod.yml` from the file you pass
via `--env-file`. `.env.production.example` carries the same list with inline
notes.

### Required

The stack fails to start if any of these are missing.

| Variable | Description |
| ---------- | ------------- |
| `DB_PASSWORD` | PostgreSQL password |
| `JWT_SECRET` | Access token secret — `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | Refresh token secret — must differ from `JWT_SECRET` |

`DB_USER` defaults to `travel_life_user` and `DB_NAME` to `travel_life`. The
database container is not published to the host.

### URLs and Ports

| Variable | Default | Description |
| ---------- | --------- | ------------- |
| `FRONTEND_PORT` | `80` | Host port for the frontend — the reverse proxy target |
| `BACKEND_PORT` | `5000` | Host port for the API. Published on `INTERNAL_BIND_ADDRESS` only |
| `INTERNAL_BIND_ADDRESS` | `127.0.0.1` | Host interface the API, database and Nominatim ports are published on. The frontend proxies `/api` and `/uploads` over the compose network, so these ports are not needed from outside the host. Set to `0.0.0.0` only if another machine must reach them directly (for example a reverse proxy on a different host that talks to the API), and firewall them |
| `BASE_URL` | `http://localhost:5000` | Public backend URL. Used to build OIDC redirect URLs |
| `FRONTEND_URL` | `http://localhost:3000` | Public app URL. Used for invitation links and post-SSO redirects |
| `CORS_ORIGIN` | localhost origins | Comma-separated allowed browser origins. Only needed when the frontend and API are on different origins |
| `VITE_API_URL` | `/api` | Build-time only — requires an image rebuild |
| `VITE_UPLOAD_URL` | `/uploads` | Build-time only — requires an image rebuild |

### Geocoding (Nominatim)

| Variable | Default | Description |
| ---------- | --------- | ------------- |
| `NOMINATIM_URL` | `http://nominatim:8080` | Where the backend reaches Nominatim |
| `NOMINATIM_PORT` | `8080` | Host port for the Nominatim container |
| `NOMINATIM_PBF_URL` | US extract | [Geofabrik](https://download.geofabrik.de/) OSM extract to import |
| `NOMINATIM_REPLICATION_URL` | US updates | Matching update feed |

### Optional Integrations

| Variable | Description |
| ---------- | ------------- |
| `OPENROUTESERVICE_API_KEY` | **Recommended.** Road distances for car/bike/walking; falls back to straight-line math without it |
| `OPENROUTESERVICE_URL` | Only for a self-hosted ORS instance |
| `OPENWEATHERMAP_API_KEY` | Weather data |
| `AVIATIONSTACK_API_KEY` | Flight status, gate, terminal, baggage |
| `IMMICH_API_URL`, `IMMICH_API_KEY` | Immich photo library |

### AI Features

Powers PDF import and packing/activity suggestions. Users may also supply their
own key in Settings; these are the instance-wide defaults.

| Variable | Default | Description |
| ---------- | --------- | ------------- |
| `AI_ENABLED` | enabled | `false` disables the AI features entirely |
| `LLM_API_KEY` | — | Provider API key |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible endpoint |
| `LLM_MODEL` | `gpt-4o-mini` | Model name |
| `LLM_MAX_TOKENS` | `2048` | Max tokens per request |

### Single Sign-On (OIDC)

Enabled when `OIDC_ISSUER_URL` and `OIDC_CLIENT_ID` are both set. PKCE (S256) is
always used. Register `<BASE_URL>/api/auth/oidc/callback` with your provider.

| Variable | Default | Description |
| ---------- | --------- | ------------- |
| `OIDC_ISSUER_URL` | — | Provider issuer URL |
| `OIDC_CLIENT_ID` | — | Client ID |
| `OIDC_CLIENT_SECRET` | — | Omit for public clients (PKCE only) |
| `OIDC_REDIRECT_URL` | `<BASE_URL>/api/auth/oidc/callback` | Override the callback URL |
| `OIDC_SCOPES` | `openid profile email` | Scopes to request |
| `OIDC_BUTTON_TEXT` | `Sign in with SSO` | Login button label |
| `OIDC_AUTO_PROVISION` | enabled | `false` requires the account to already exist |
| `OIDC_TRUST_EMAIL` | `false` | `true` links by email when the IdP omits `email_verified`. Only enable if you control the IdP |
| `DISABLE_PASSWORD_LOGIN` | `false` | `true` enables SSO-only mode. Ignored unless OIDC is enabled |
| `DISABLE_REGISTRATION` | `false` | `true` closes self-service sign-up, so new accounts come only from invitations (and from SSO, if `OIDC_AUTO_PROVISION` allows it). Recommended for any server reachable from the internet |

### Push Notifications

Generate a key pair with `npx web-push generate-vapid-keys`. Push degrades
gracefully when unset.

| Variable | Description |
| ---------- | ------------- |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | VAPID key pair |
| `VAPID_SUBJECT` | Contact URI, e.g. `mailto:admin@your-domain.com` |

### Saved-Link Email Ingest (IMAP)

Inert unless `IMAP_USER` and `IMAP_PASSWORD` are both set.

| Variable | Default | Description |
| ---------- | --------- | ------------- |
| `IMAP_USER` | — | Ingest mailbox address |
| `IMAP_PASSWORD` | — | Gmail requires an App Password, not the account password |
| `IMAP_HOST` | `imap.gmail.com` | IMAP server |
| `IMAP_PORT` | `993` | IMAP port (TLS) |
| `IMAP_ARCHIVE_FOLDER` | `[Gmail]/All Mail` | Processed mail is moved here, not deleted |
| `IMAP_POLL_CRON` | `*/5 * * * *` | Poll schedule |
| `IMAP_MAX_LINKS` | `20` | Max links captured per message |

Messages are only accepted from a user's account email or a trusted address
(Settings → Link Ingest). A `From` header is forgeable — treat the mailbox
address itself as a secret.

### Outbound Email (SMTP)

Instance-wide fallback for invitation mail; users can override it per-account in
Settings. Invitations still work when unset — the inviter shares the link manually.

| Variable | Default | Description |
| ---------- | --------- | ------------- |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` | — | All three required to enable email |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_SECURE` | `false` | `true` for port 465 |
| `SMTP_FROM` | `Travel Life <noreply@example.com>` | From header |

### Tuning

| Variable | Default | Description |
| ---------- | --------- | ------------- |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token lifetime |
| `COOKIE_SAME_SITE` | `strict` | `strict`, `lax`, or `none`. `none` requires HTTPS |
| `COOKIE_DOMAIN` | — | e.g. `.example.com` to share the refresh cookie across subdomains |
| `MAX_FILE_SIZE` | `52428800` | Max upload bytes (50MB). nginx caps bodies at 100M |
| `AI_RATE_LIMIT_MAX` / `AI_RATE_LIMIT_WINDOW_MS` | `20` / `3600000` | Per-user AI limit |
| `BACKUP_RATE_LIMIT_MAX` / `BACKUP_RATE_LIMIT_WINDOW_MS` | `5` / `3600000` | Per-user backup limit |

## Database Management

### Running Migrations

```bash
# Deploy pending migrations
docker exec travel-life-backend npx prisma migrate deploy

# Check migration status
docker exec travel-life-backend npx prisma migrate status
```

### Database Backup

```bash
# Create backup
docker exec travel-life-db pg_dump -U $DB_USER $DB_NAME > backup_$(date +%Y%m%d).sql

# Automated daily backup (add to crontab)
0 2 * * * docker exec travel-life-db pg_dump -U travel_life_user travel_life > /backups/db_$(date +\%Y\%m\%d).sql
```

### Database Restore

```bash
# Restore from backup
docker exec -i travel-life-db psql -U $DB_USER $DB_NAME < backup.sql
```

## Reverse Proxy Setup

The frontend container runs nginx on plain HTTP (port 80) and already proxies
`/api` and `/uploads` to the backend over the compose network. Do **not** add TLS
directives to `frontend/nginx.conf` — terminate TLS at the reverse proxy in front
of it.

That means the simplest correct config is a single route to `FRONTEND_PORT`:

```caddyfile
your-domain.com {
    reverse_proxy localhost:80
}
```

The split configs below route `/api` and `/uploads` straight to the backend
instead, bypassing the container nginx. Use them only if you have a reason to —
for example exposing the API on its own hostname.

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Frontend
    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # File uploads
    location /uploads {
        proxy_pass http://localhost:5000;
        client_max_body_size 100M;
    }
}
```

### Caddy Configuration

```caddyfile
your-domain.com {
    # Frontend
    handle {
        reverse_proxy localhost:80
    }

    # Backend API
    handle /api/* {
        reverse_proxy localhost:5000
    }

    # Uploads
    handle /uploads/* {
        reverse_proxy localhost:5000
    }
}
```

### CDN Configuration (Cloudflare and similar)

A CDN in front of the app must not cache the four files with stable, non-content-hashed
names: `/sw.js`, `/registerSW.js`, `/manifest.webmanifest` and `/index.html`. The frontend
serves all four as `no-cache` (see the exact-match locations in `frontend/nginx.conf`), and
a CDN that respects origin cache headers will honour that. Everything under `/assets/` is
content-hashed and safe to cache immutably.

Caching `sw.js` breaks the PWA in a way that is not self-correcting. The service worker's
precache manifest names the exact asset filenames of the build it shipped with; the next
deploy replaces those files with new hashes, so a stale `sw.js` precaches URLs that now
404. Installation fails (`bad-precaching-response` in the console, followed by "Service
worker became redundant"), and it fails again on every visit for as long as the edge keeps
serving the old copy. The app itself still loads — only offline support is dead.

**Upgrading from 6.0.0 or earlier?** Those versions served `sw.js` as
`Cache-Control: public, max-age=31536000, immutable`, so any CDN that cached it holds it
for a year and the fix in 6.0.1 cannot dislodge it. Purge that one URL once, then confirm
the origin header is correct — a query string bypasses the edge copy:

```bash
curl -sI "https://your-domain.com/sw.js?cachebust=$(date +%s)" | grep -i cache-control
# expected: Cache-Control: no-cache, no-store, must-revalidate
```

## SSL/TLS Configuration

### Using Let's Encrypt (Certbot)

```bash
# Install certbot
apt install certbot python3-certbot-nginx

# Obtain certificate
certbot --nginx -d your-domain.com

# Auto-renewal (usually automatic, but verify)
certbot renew --dry-run
```

## Backup and Recovery

### Full Backup Script

```bash
#!/bin/bash
BACKUP_DIR="/backups/travel-life"
DATE=$(date +%Y%m%d_%H%M%S)

# Database
docker exec travel-life-db pg_dump -U travel_life_user travel_life > $BACKUP_DIR/db_$DATE.sql

# Uploads
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz /var/lib/docker/volumes/travel-life_uploads/_data

# Cleanup old backups (keep 30 days)
find $BACKUP_DIR -mtime +30 -delete
```

### In-App Backup

The application includes built-in backup functionality:

1. Go to Settings > Backup & Restore
2. Click "Create Backup"
3. Download the backup file (JSON format)

## Monitoring

### Health Checks

```bash
# Backend health
curl http://localhost:5000/health

# Container status
docker-compose -f docker-compose.prod.yml ps

# Logs
docker-compose -f docker-compose.prod.yml logs -f
```

### Log Monitoring

```bash
# Follow all logs
docker-compose -f docker-compose.prod.yml logs -f

# Backend logs only
docker logs -f travel-life-backend

# Database logs
docker logs -f travel-life-db
```

## Updating the Application

### Using Release Script

```bash
# Check current version (version lives in package.json)
node -p "require('./backend/package.json').version"

# Pull latest changes
git pull origin main

# Run release script (Linux/Mac)
./release.sh patch     # or minor / major / an explicit version like 5.6.2 or v5.6.2

# Windows
.\release.ps1 -Version patch
```

The release script bumps both `package.json` files, updates `CHANGELOG.md`, verifies the
builds, commits and creates the tag. **It does not publish images.** Push the tag:

```bash
git push origin main && git push origin v5.6.2
```

Pushing the tag triggers `.github/workflows/release.yml`, which is the single publisher of
`ghcr.io` images and of the GitHub Release. Wait for that workflow to go green, then deploy
with `APP_VERSION` set to the new tag (see [Pinning the Deployed Version](#pinning-the-deployed-version-app_version)).

### Manual Update

```bash
# Pull latest images
docker-compose -f docker-compose.prod.yml pull

# Restart with new images
docker-compose -f docker-compose.prod.yml up -d

# Run any new migrations
docker exec travel-life-backend npx prisma migrate deploy
```

### Rollback

On the TrueNAS compose files, a rollback is a single variable change (replace vX.Y.Z with
the version you want to return to):

```bash
APP_VERSION=vX.Y.Z docker-compose -f docker-compose.truenas.yml pull
APP_VERSION=vX.Y.Z docker-compose -f docker-compose.truenas.yml up -d
```

For `docker-compose.prod.yml`:

```bash
# Stop current version
docker-compose -f docker-compose.prod.yml down

# Pull the target version explicitly (replace vX.Y.Z with the target version tag)
docker pull ghcr.io/dsbaciga/travel-life-backend:vX.Y.Z
docker pull ghcr.io/dsbaciga/travel-life-frontend:vX.Y.Z

# Start with that version
docker-compose -f docker-compose.prod.yml up -d --no-build
```

## Security Checklist

### Pre-Deployment

- [ ] Strong, unique `DB_PASSWORD`
- [ ] `JWT_SECRET` and `JWT_REFRESH_SECRET` generated separately (`openssl rand -base64 48`)
- [ ] `BASE_URL` and `FRONTEND_URL` set to the real public URLs
- [ ] `.env.production` excluded from version control (already in `.gitignore`)

### Network Security

- [ ] Configure firewall (only expose 80/443)
- [ ] Terminate TLS at the reverse proxy
- [ ] `CORS_ORIGIN` set to your domain only if the frontend and API are on different origins — leave unset when using the bundled nginx proxy
- [ ] Nominatim (`NOMINATIM_PORT`) not exposed publicly
- [ ] `INTERNAL_BIND_ADDRESS` left at `127.0.0.1`, so the API, database and Nominatim ports are not reachable from the network. Reaching the API port directly bypasses the frontend proxy, and the API then trusts a client-supplied `X-Forwarded-For` for rate limiting

### Application Security

- [ ] Refresh cookies are httpOnly and `secure` automatically when `NODE_ENV=production`
- [ ] `COOKIE_SAME_SITE` left at `strict` unless a cross-domain setup requires otherwise
- [ ] Review `MAX_FILE_SIZE` against your nginx body limit (100M)
- [ ] Rate limits reviewed (`AI_RATE_LIMIT_*`, `BACKUP_RATE_LIMIT_*`)
- [ ] If SSO-only, confirm `DISABLE_PASSWORD_LOGIN=true` **and** OIDC is working before locking yourself out
- [ ] Once your own account exists, set `DISABLE_REGISTRATION=true` so strangers cannot sign up

### Operational Security

- [ ] Set up automated backups
- [ ] Configure log rotation
- [ ] Set up monitoring/alerting
- [ ] Document recovery procedures
- [ ] Test backup restoration

## Troubleshooting

### Container won't start

```bash
# Check logs
docker logs travel-life-backend

# Common issues:
# - Database not ready: wait for healthcheck
# - Port conflict: change ports in .env.production
# - Missing env vars: verify .env.production
```

### Database connection failed

```bash
# Verify database is running
docker exec travel-life-db pg_isready

# Check connection string
docker exec travel-life-backend printenv DATABASE_URL
```

### Nominatim not working

Nominatim requires significant initialization time (1-2 hours) on first start.

```bash
# Check progress
docker logs travel-life-nominatim

# Verify it's ready
curl http://localhost:8080/status
```

## Related Documentation

- [QUICK_START_PRODUCTION.md](QUICK_START_PRODUCTION.md) - Fast setup guide
- [docs/guides/BUILD_AND_PUSH.md](docs/guides/BUILD_AND_PUSH.md) - Build process
- [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) - Release procedures
- [docs/guides/ROUTING_SETUP.md](docs/guides/ROUTING_SETUP.md) - OpenRouteService configuration
