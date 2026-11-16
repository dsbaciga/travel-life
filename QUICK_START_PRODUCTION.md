# Quick Start Production Setup

Get Travel Life running in production in under 10 minutes.

## Prerequisites

- Docker and Docker Compose installed
- Access to your production server
- Domain name (optional but recommended)

## Steps

### 1. Clone and Configure (2 minutes)

```bash
git clone https://github.com/dsbaciga/travel-life.git
cd travel-life
```

Create `.env.production` from the template (it lists every variable with notes):

```bash
cp .env.production.example .env.production
```

At minimum, set:

```bash
# Required (the stack will not start without these)
DB_PASSWORD=your_secure_password_here
# Generate each with: openssl rand -base64 48 (32+ chars, and they must differ)
JWT_SECRET=<random-string>
JWT_REFRESH_SECRET=<different-random-string>

# Public URLs (used for SSO redirects and invitation links)
BASE_URL=https://your-domain.com
FRONTEND_URL=https://your-domain.com

# Recommended once your own account exists, and when the server is internet-facing
DISABLE_REGISTRATION=true
# Set to 2 if a TLS proxy or tunnel sits in front of the bundled nginx (default 1)
# TRUST_PROXY=2
```

`VITE_API_URL` and `VITE_UPLOAD_URL` default to `/api` and `/uploads`, which the bundled
nginx proxies to the backend; leave them alone. Optional integrations (weather, flights,
Immich, AI, SSO, push, email ingest) are all listed in [DEPLOYMENT.md](DEPLOYMENT.md#environment-configuration).

### 2. Start Services (5 minutes)

```bash
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
```

### 3. Run Database Migrations (1 minute)

```bash
docker exec travel-life-backend npx prisma migrate deploy
```

### 4. Verify Installation (1 minute)

- Frontend: http://your-server:80
- Backend Health (from the server itself): http://localhost:5000/health

The API, Nominatim and database ports are published on the server's loopback
interface only (`INTERNAL_BIND_ADDRESS=127.0.0.1`), so they are not reachable from other
machines. Use the frontend, which proxies `/api` and `/uploads`.

### 5. Create Your Account

1. Navigate to the frontend URL
2. Click "Register" to create your account
3. Start adding trips!

If you set `DISABLE_REGISTRATION=true` before this step, the register link is hidden and
the API refuses sign-up. Leave it unset until your account exists, then set it and
re-run the `up -d` command from step 2 to recreate the backend.

## Default Ports

`docker-compose.prod.yml` (the TrueNAS compose files use 30600-30603 instead):

| Service | Host port | Reachable from |
|---------|-----------|----------------|
| Frontend | 80 (`FRONTEND_PORT`) | All interfaces |
| Backend API | 5000 (`BACKEND_PORT`) | Loopback only |
| Nominatim | 8080 (`NOMINATIM_PORT`) | Loopback only |
| Database | not published | Compose network only |

Set `INTERNAL_BIND_ADDRESS=0.0.0.0` only if another machine must reach the loopback-only
ports, and firewall them if you do.

## Pinning a Version

Container images are published by CI when a `v*` tag is pushed, and are available as
`ghcr.io/dsbaciga/travel-life-backend:<version>` (both `7.3.0` and `v7.3.0` forms, plus
`latest`).

The TrueNAS compose files (`docker-compose.truenas.yml`,
`docker-compose.truenas.optimized.yml`) deploy a pinned `${APP_VERSION}` rather than
`:latest`, so a deploy is reproducible:

```bash
APP_VERSION=v7.3.0 docker-compose -f docker-compose.truenas.yml up -d
```

Set `APP_VERSION` in your env file to make it stick; change it to the previous tag to roll
back. See [DEPLOYMENT.md](DEPLOYMENT.md#pinning-the-deployed-version-app_version).

## Next Steps

- Set up HTTPS with a reverse proxy (nginx, Caddy, Traefik)
- Configure automatic backups
- Set up monitoring
- Review [DEPLOYMENT.md](DEPLOYMENT.md) for detailed configuration options

## Troubleshooting

### Services not starting?

```bash
docker-compose -f docker-compose.prod.yml logs
```

### Database connection issues?

```bash
docker exec travel-life-backend npx prisma migrate status
docker exec travel-life-backend npx prisma migrate deploy
```

### Need to reset everything?

```bash
docker-compose -f docker-compose.prod.yml down -v
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
```

## Getting Help

- Check [docs/development/BUGS.md](docs/development/BUGS.md) for known issues
- Review [docs/guides/BUILD_AND_PUSH.md](docs/guides/BUILD_AND_PUSH.md) for build details
- See [DEPLOYMENT.md](DEPLOYMENT.md) for comprehensive deployment guide
