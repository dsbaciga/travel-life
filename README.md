# Travel Life

A comprehensive travel documentation application for tracking trips, locations, photos, transportation, lodging, and journal entries.

## Features

### Trip planning and records

- **Trip Management**: Create and manage trips with multiple destinations and statuses (Dream, Planning, Planned, In Progress, Completed, Cancelled), with automatic status transitions based on dates
- **Trip Series**: Group related trips into a series with a combined overview
- **Location Tracking**: Add points of interest with custom categories, visit duration, and notes
- **Activities**: Track planned and completed activities with user-defined categories and costs
- **Transportation**: Flights, trains, buses, ferries, car rentals and more, with booking details, dual timezones, route maps, and flight tracking (gate, terminal, baggage claim)
- **Lodging**: Accommodations with check-in/out times, confirmation details, and multi-day timeline display
- **Journal Entries**: Trip-level or daily journals with mood and weather tracking
- **Checklists**: Reusable packing and prep checklists with auto-population
- **Travel Documents**: Passports, visas, and document expiry tracking
- **Expenses**: Per-trip budget and expense tracking
- **Timeline and Day-by-Day views**: Chronological views spanning every entity type

### Media and maps

- **Photo Management**: Upload photos or connect a self-hosted Immich instance, organize into albums, EXIF parsing and geotagging
- **Places Visited Map**: Visualize all locations from completed trips on a global map
- **Weather Integration**: Historical and forecast weather data

### Collaboration and sharing

- **Travel Companions**: Track who you travelled with
- **Trip Collaboration**: Invite other users to a trip by email
- **Public Trip Sharing**: Publish a read-only trip page via a share link
- **iCal Feed**: Subscribe to trip dates from your calendar app

### Automation and integrations

- **PDF + AI Import**: Extract bookings and itineraries from PDF documents
- **AI Suggestions**: Packing suggestions, activity ideas, and language phrases
- **Saved Links**: Save links for later, including an optional forward-to-inbox email ingest
- **Push Notifications**: Web Push reminders (PWA, works offline)
- **Single Sign-On**: OIDC/OAuth login with any provider, with optional SSO-only mode

### Data management

- **Backup and Restore**: In-app JSON backup and restore
- **Import/Export**: Export trips to XML and print-friendly reports
- **Global Search**: Search across every entity type with advanced filtering
- **Memories and Year in Review**: Automatic retrospectives from your trip history

## Tech Stack

### Backend

- Node.js + Express + TypeScript
- PostgreSQL with PostGIS
- Prisma ORM
- JWT Authentication

### Frontend

- React + TypeScript
- Vite
- Tailwind CSS
- React Router
- TanStack Query (React Query)
- Zustand (State Management)
- Leaflet (OpenStreetMap)
- TipTap (Rich Text Editor)
- PWA with offline support and Web Push

### Infrastructure

- Docker Compose (nginx serves the frontend and proxies `/api` and `/uploads`)
- Self-hosted Nominatim (Geocoding)

### Optional external services

All of these are optional — the related feature simply stays off when unconfigured.

| Service | Powers |
| ------- | ------ |
| OpenRouteService | Accurate road distances (car, bicycle, walking) |
| OpenWeatherMap | Historical and forecast weather |
| AviationStack | Flight status, gate, terminal, baggage claim |
| Immich | Photo library integration |
| Any OpenAI-compatible LLM | PDF import and AI suggestions |
| Any OIDC provider | Single sign-on |
| SMTP server | Collaboration invitation emails |
| IMAP mailbox | Saved-link email ingest |

## Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local development)
- npm or yarn

## Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd "Travel-Life"
```

### 2. Set Up Environment Variables

#### Backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`. `JWT_SECRET` and `JWT_REFRESH_SECRET` are **required** — the
backend refuses to start without them. Generate each with:

```bash
openssl rand -base64 48
```

Everything else is optional. See [Configuration](#configuration) for the full list.

#### Frontend

```bash
cd frontend
cp .env.example .env
```

The frontend `.env` defaults should work with Docker Compose.

### 3. Start with Docker Compose

The development compose file reads `JWT_SECRET` and `JWT_REFRESH_SECRET` from
your shell or from a root `.env` file, and fails fast if they are unset:

```bash
docker-compose up -d
```

This will start:

- PostgreSQL database with PostGIS (port 5432)
- Backend API (port 5000)
- Frontend (port 3000)
- Nominatim geocoding service (port 8080)

**Note**: Nominatim may take 1-2 hours to fully initialize on first run as it downloads and processes map data.

### 4. Run Database Migrations

```bash
cd backend
docker exec -it travel-life-backend npx prisma migrate dev
```

### 5. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **API Health Check**: http://localhost:5000/health

## Local Development (Without Docker)

### Backend

1. Install dependencies:

```bash
cd backend
npm install
```

2. Set up PostgreSQL with PostGIS locally and update `DATABASE_URL` in `.env`

3. Run migrations:

```bash
npm run prisma:migrate
```

4. Generate Prisma Client:

```bash
npm run prisma:generate
```

5. Start development server:

```bash
npm run dev
```

Backend will run on http://localhost:5000

### Frontend

1. Install dependencies:

```bash
cd frontend
npm install
```

2. Start development server:

```bash
npm run dev
```

Frontend will run on http://localhost:5173 (Vite default for local development)

## Project Structure

```
Travel-Life/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma          # Database schema
│   ├── src/
│   │   ├── auth/                  # Authentication helpers
│   │   ├── config/                # Configuration files
│   │   ├── constants/             # Shared constants
│   │   ├── controllers/           # Route controllers
│   │   ├── data/                  # Seed and reference data
│   │   ├── errors/                # AppError and error utilities
│   │   ├── http/                  # HTTP helpers
│   │   ├── middleware/            # Express middleware
│   │   ├── prisma/                # Prisma client
│   │   ├── routes/                # API routes
│   │   ├── security/              # Security utilities
│   │   ├── services/              # Business logic
│   │   ├── types/                 # TypeScript types
│   │   └── validation/            # Zod validation schemas
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/            # React components
│   │   ├── pages/                 # Page components
│   │   ├── hooks/                 # Custom React hooks
│   │   ├── services/              # API services
│   │   ├── store/                 # State management
│   │   ├── types/                 # TypeScript types
│   │   └── utils/                 # Utility functions
│   ├── nginx.conf                 # Serves the SPA, proxies /api and /uploads
│   ├── Dockerfile
│   ├── Dockerfile.prod
│   └── package.json
├── docker-compose.yml             # Development
├── docker-compose.prod.yml        # Production
├── .env.production.example        # Production env template
├── docs/                          # Project documentation (see docs/README.md)
└── README.md
```

## Available Scripts

### Backend

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production (relaxed type-checking)
- `npm run build:strict` - Build with full strict type-checking
- `npm start` - Start production server
- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio (database GUI)
- `npm test` - Run tests

### Frontend

- `npm run dev` - Start development server
- `npm run build` - Build for production (TypeScript errors are non-blocking)
- `npm run build:strict` - Build with strict type-checking (errors fail the build)
- `npm run preview` - Preview production build
- `npm run lint` - Lint code
- `npm test` - Run tests (`test:ui`, `test:coverage` also available)
- `npm run analyze` - Build with the bundle analyzer (`analyze:win` on Windows)

## API Documentation

See the [API Reference](docs/api/README.md) for every endpoint, request/response
shape, and the shared `{ status, data }` envelope.

## Database Management

### Prisma Studio

To manage your database visually:

```bash
cd backend
npm run prisma:studio
```

This opens a web interface at http://localhost:5555

### Create a New Migration

```bash
cd backend
npx prisma migrate dev --name <migration_name>
```

### Reset Database

**Warning**: This will delete all data!

```bash
cd backend
npx prisma migrate reset
```

## Configuration

For local development, variables go in `backend/.env` and `frontend/.env`.

For a Docker Compose deployment, variables go in a single env file that you pass
to compose — `docker-compose.prod.yml` reads every value below from it:

```bash
cp .env.production.example .env.production
# edit .env.production
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
```

`.env.production.example` is the authoritative template and contains all of these
with inline notes.

### Required

The stack refuses to start if any of these are missing.

| Variable | Description |
| -------- | ----------- |
| `DB_PASSWORD` | PostgreSQL password |
| `JWT_SECRET` | Access token secret — generate with `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | Refresh token secret — must differ from `JWT_SECRET` |

`DB_USER` (`travel_life_user`) and `DB_NAME` (`travel_life`) default sensibly.
The database is not published to the host; only the backend container reaches it.

### URLs and ports

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `FRONTEND_PORT` | `80` | Host port for the frontend — point your reverse proxy here |
| `BACKEND_PORT` | `5000` | Host port for the API |
| `BASE_URL` | `http://localhost:5000` | Public URL of the backend. Used to build OIDC redirect URLs — must be externally reachable |
| `FRONTEND_URL` | `http://localhost:3000` | Public URL of the app. Used for invitation links and post-SSO redirects |
| `CORS_ORIGIN` | localhost origins | Comma-separated allowed browser origins. Only needed when the frontend is served from a different origin than the API |
| `VITE_API_URL` | `/api` | **Build-time only** — see below |
| `VITE_UPLOAD_URL` | `/uploads` | **Build-time only** — see below |
| `VITE_CARTO_API_KEY` | _(empty)_ | **Build-time only.** Free [CARTO basemaps key](https://carto.com/basemaps/apikey) for the light/dark map styles. Without it the app falls back to OpenStreetMap tiles. In CI, set it as a repository **variable** |

**`VITE_*` variables are baked into the frontend bundle at image build time.**
Changing them requires `docker-compose -f docker-compose.prod.yml build frontend`,
not a restart. The bundled nginx already proxies `/api` and `/uploads` to the
backend, so the relative defaults work behind any domain and avoid CORS entirely.

### Geocoding (Nominatim)

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `NOMINATIM_URL` | `http://nominatim:8080` | Where the backend reaches Nominatim |
| `NOMINATIM_PORT` | `8080` | Host port for the Nominatim container |
| `NOMINATIM_PBF_URL` | US extract | OSM extract to import |
| `NOMINATIM_REPLICATION_URL` | US updates | Matching update feed |

The default setup downloads US map data. To use another region, point both URLs
at a different [Geofabrik](https://download.geofabrik.de/) extract:

```bash
NOMINATIM_PBF_URL=https://download.geofabrik.de/europe/germany-latest.osm.pbf
NOMINATIM_REPLICATION_URL=https://download.geofabrik.de/europe/germany-updates/
```

First startup takes 1-2 hours to import the data.

### Optional integrations

Each of these is inert until configured — the feature is simply unavailable.

| Variable | Description |
| -------- | ----------- |
| `OPENROUTESERVICE_API_KEY` | **Recommended.** Road distances for car/bicycle/walking. Free key at [openrouteservice.org](https://openrouteservice.org/dev/#/signup) (2,000 requests/day). Without it those distances fall back to straight-line math. See [ROUTING_SETUP.md](docs/guides/ROUTING_SETUP.md) |
| `OPENROUTESERVICE_URL` | Only for a self-hosted ORS instance |
| `OPENWEATHERMAP_API_KEY` | Weather data — [openweathermap.org](https://openweathermap.org/) |
| `AVIATIONSTACK_API_KEY` | Flight status, gate, terminal, baggage — [aviationstack.com](https://aviationstack.com/) |
| `IMMICH_API_URL`, `IMMICH_API_KEY` | Immich photo library. Generate the key in Immich settings |

### AI features

Powers PDF import and packing/activity suggestions. Users can also supply their
own key in Settings; these are the instance-wide defaults.

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `AI_ENABLED` | enabled | Set to `false` to turn the AI features off entirely |
| `LLM_API_KEY` | — | API key for the LLM provider |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible endpoint |
| `LLM_MODEL` | `gpt-4o-mini` | Model name |
| `LLM_MAX_TOKENS` | `2048` | Max tokens per request |

### Single sign-on (OIDC)

SSO turns on when `OIDC_ISSUER_URL` and `OIDC_CLIENT_ID` are both set. Works with
Google, Authentik, Keycloak, Pocket ID, or any OIDC provider. PKCE (S256) is
always used. Register `<BASE_URL>/api/auth/oidc/callback` with your provider.

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `OIDC_ISSUER_URL` | — | Provider issuer URL |
| `OIDC_CLIENT_ID` | — | Client ID |
| `OIDC_CLIENT_SECRET` | — | Omit for public clients (PKCE only) |
| `OIDC_REDIRECT_URL` | `<BASE_URL>/api/auth/oidc/callback` | Override the callback URL |
| `OIDC_SCOPES` | `openid profile email` | Scopes to request |
| `OIDC_BUTTON_TEXT` | `Sign in with SSO` | Login page button label |
| `OIDC_AUTO_PROVISION` | enabled | `false` requires the account to already exist |
| `OIDC_TRUST_EMAIL` | `false` | `true` links by email when the IdP omits `email_verified` entirely. An explicit `email_verified: false` is still rejected — only enable if you control the IdP |
| `DISABLE_PASSWORD_LOGIN` | `false` | `true` enables SSO-only mode. Ignored unless OIDC is enabled, so a stray value cannot lock you out |

### Push notifications

Web Push is disabled gracefully when unset. Generate a key pair with
`npx web-push generate-vapid-keys`.

| Variable | Description |
| -------- | ----------- |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | VAPID key pair |
| `VAPID_SUBJECT` | Contact URI, e.g. `mailto:admin@your-domain.com` |

### Saved-link email ingest (IMAP)

Forward a link to the ingest mailbox and it lands in your saved-links inbox.
Entirely inert unless `IMAP_USER` and `IMAP_PASSWORD` are both set.

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `IMAP_USER` | — | The ingest mailbox address |
| `IMAP_PASSWORD` | — | Gmail requires an [App Password](https://myaccount.google.com/apppasswords), not the account password |
| `IMAP_HOST` | `imap.gmail.com` | IMAP server |
| `IMAP_PORT` | `993` | IMAP port (TLS) |
| `IMAP_ARCHIVE_FOLDER` | `[Gmail]/All Mail` | Processed mail is **moved** here, not deleted |
| `IMAP_POLL_CRON` | `*/5 * * * *` | Poll schedule |
| `IMAP_MAX_LINKS` | `20` | Max links captured per message |

A message is only accepted when its `From` matches a user's account email or one
of their trusted addresses (Settings → Link Ingest). A `From` header is
forgeable, so treat the mailbox address itself as a secret.

### Outbound email (SMTP)

Instance-wide fallback for collaboration invitations; users can override it
per-account in Settings. Invitations still work when unset — the inviter just
shares the accept link manually.

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` | — | All three required to enable email |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_SECURE` | `false` | `true` for port 465 |
| `SMTP_FROM` | `Travel Life <noreply@example.com>` | From header |

### Tuning

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token lifetime |
| `COOKIE_SAME_SITE` | `strict` | `strict`, `lax`, or `none`. Use `lax`/`none` only when the frontend and API are on different domains; `none` also requires HTTPS |
| `COOKIE_DOMAIN` | — | e.g. `.example.com` to share the refresh cookie across subdomains |
| `MAX_FILE_SIZE` | `52428800` | Max upload size in bytes (50MB). The bundled nginx caps request bodies at 100M, so going past that needs an `nginx.conf` change too |
| `AI_RATE_LIMIT_MAX` / `AI_RATE_LIMIT_WINDOW_MS` | `20` / `3600000` | Per-user AI request limit |
| `BACKUP_RATE_LIMIT_MAX` / `BACKUP_RATE_LIMIT_WINDOW_MS` | `5` / `3600000` | Per-user backup request limit |

## Troubleshooting

### Database Connection Issues

Ensure PostgreSQL container is healthy:

```bash
docker ps
```

Check logs:

```bash
docker logs travel-life-db
```

### Prisma Client Not Generated

```bash
cd backend
npx prisma generate
```

### Port Already in Use

In production, change the host ports via env vars:

```bash
BACKEND_PORT=5001
FRONTEND_PORT=8080
NOMINATIM_PORT=8081
```

In development, edit the `ports:` mappings in `docker-compose.yml` directly.

### Nominatim Not Responding

Nominatim takes time to initialize. Check progress:

```bash
docker logs travel-life-nominatim
```

## Production Deployment

### Quick version

```bash
# 1. Create the environment file
cp .env.production.example .env.production
# edit .env.production - at minimum DB_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET,
# BASE_URL, and FRONTEND_URL

# 2. Build and start
docker-compose -f docker-compose.prod.yml --env-file .env.production build
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d

# 3. Apply migrations
docker exec travel-life-backend npx prisma migrate deploy
```

The frontend container listens on plain HTTP and expects a TLS-terminating
reverse proxy (Caddy, Traefik, nginx-proxy-manager, Cloudflare Tunnel) in front
of it. It proxies `/api` and `/uploads` to the backend, so a single hostname is
all you need.

See [DEPLOYMENT.md](DEPLOYMENT.md) for reverse proxy configs, TrueNAS setup,
backups, and updates, or [QUICK_START_PRODUCTION.md](QUICK_START_PRODUCTION.md)
for the fast path.

### Security Checklist

- [ ] Strong, unique `DB_PASSWORD`
- [ ] Distinct 48+ byte `JWT_SECRET` and `JWT_REFRESH_SECRET`
- [ ] HTTPS terminated at the reverse proxy
- [ ] `BASE_URL` and `FRONTEND_URL` set to the real public URLs
- [ ] `CORS_ORIGIN` set if the frontend and API are on different origins
- [ ] Firewall exposes only 80/443
- [ ] Database backups scheduled (see [DEPLOYMENT.md](DEPLOYMENT.md#backup-and-recovery))
- [ ] Upload volume included in backups
- [ ] Rate limits reviewed (`AI_RATE_LIMIT_*`, `BACKUP_RATE_LIMIT_*`)
- [ ] Log rotation and monitoring in place

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT

## Support

For detailed planning and architecture documentation, see the [Documentation Index](docs/README.md).

For issues and feature requests, please use the GitHub issue tracker.
