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

# Create production environment file
cp .env.example .env.production
```

### Step 2: Configure Environment

Edit `.env.production`:

```bash
# Database Configuration
DB_USER=travel_life_user
DB_PASSWORD=<generate-strong-password>
DB_NAME=travel_life
DB_PORT=5432

# JWT Secrets (generate with: openssl rand -base64 64)
JWT_SECRET=<64-char-random-string>
JWT_REFRESH_SECRET=<64-char-random-string>

# Application URLs
VITE_API_URL=https://your-domain.com/api
VITE_UPLOAD_URL=https://your-domain.com/uploads

# Ports
BACKEND_PORT=5000
FRONTEND_PORT=80

# Optional: External Services
IMMICH_API_URL=http://immich-server:2283/api
IMMICH_API_KEY=your-immich-api-key
OPENWEATHERMAP_API_KEY=your-owm-key
AVIATIONSTACK_API_KEY=your-aviationstack-key
OPENROUTESERVICE_API_KEY=your-ors-key
```

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

- Image: `ghcr.io/dsbaciga/travel-life-backend:latest`
- Port: 5000
- Environment variables: (see above)

**Frontend Container:**

- Image: `ghcr.io/dsbaciga/travel-life-frontend:latest`
- Port: 80

**Database:**

- Use TrueNAS built-in PostgreSQL or external database

### TrueNAS-Optimized Compose

Use the TrueNAS-specific compose file:

```bash
docker-compose -f docker-compose.truenas.yml up -d
```

## Environment Configuration

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DB_USER` | Database username | `travel_life_user` |
| `DB_PASSWORD` | Database password | `secure_password` |
| `JWT_SECRET` | Access token secret | 64+ random chars |
| `JWT_REFRESH_SECRET` | Refresh token secret | 64+ random chars |
| `VITE_API_URL` | Backend API URL | `https://api.example.com` |
| `VITE_UPLOAD_URL` | Upload files URL | `https://api.example.com/uploads` |

### Optional Integrations

| Variable | Description |
|----------|-------------|
| `IMMICH_API_URL` | Immich server API URL |
| `IMMICH_API_KEY` | Immich API key |
| `OPENWEATHERMAP_API_KEY` | Weather data API key |
| `AVIATIONSTACK_API_KEY` | Flight tracking API key |
| `OPENROUTESERVICE_API_KEY` | Road distance calculations |

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
# Check current version
cat VERSION

# Pull latest changes
git pull origin main

# Run release script
./release.sh patch  # or minor/major
```

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

```bash
# Stop current version
docker-compose -f docker-compose.prod.yml down

# Start previous version
docker-compose -f docker-compose.prod.yml up -d --no-build

# Or specify version explicitly
docker pull ghcr.io/dsbaciga/travel-life-backend:v4.5.7
docker pull ghcr.io/dsbaciga/travel-life-frontend:v4.5.7
```

## Security Checklist

### Pre-Deployment

- [ ] Generate strong, unique passwords for database
- [ ] Generate 64+ character random JWT secrets
- [ ] Review and restrict CORS settings
- [ ] Disable debug mode in production

### Network Security

- [ ] Configure firewall (only expose 80/443)
- [ ] Enable SSL/TLS
- [ ] Set up rate limiting
- [ ] Configure CORS for your domain only

### Application Security

- [ ] Enable HTTPS-only cookies
- [ ] Set secure headers (CSP, HSTS, etc.)
- [ ] Review file upload limits
- [ ] Enable audit logging

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
