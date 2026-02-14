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

Create `.env.production` file:

```bash
# Required
DB_USER=travel_life_user
DB_PASSWORD=your_secure_password_here
DB_NAME=travel_life
JWT_SECRET=your_very_long_random_jwt_secret_min_32_chars
JWT_REFRESH_SECRET=another_very_long_random_secret_min_32_chars

# URLs (update for your domain)
VITE_API_URL=http://your-domain:5000/api
VITE_UPLOAD_URL=http://your-domain:5000/uploads

# Optional integrations
IMMICH_API_URL=
IMMICH_API_KEY=
OPENWEATHERMAP_API_KEY=
AVIATIONSTACK_API_KEY=
OPENROUTESERVICE_API_KEY=
```

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
- Backend Health: http://your-server:5000/health
- API: http://your-server:5000/api

### 5. Create Your Account

1. Navigate to the frontend URL
2. Click "Register" to create your account
3. Start adding trips!

## Default Ports

| Service | Port |
|---------|------|
| Frontend | 80 |
| Backend API | 5000 |
| Database | 5432 |
| Nominatim | 8080 |

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
docker exec travel-life-backend npx prisma db push
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
