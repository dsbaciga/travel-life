# HTTPS / TLS Setup Guide

This guide covers configuring HTTPS for a production Travel Life deployment. Since Travel Life is designed for self-hosting, TLS termination is handled by a reverse proxy in front of the application stack.

## Option 1: Nginx Reverse Proxy with Let's Encrypt (Recommended)

The simplest approach is to run a host-level Nginx that terminates TLS and proxies to the Docker containers.

### 1. Install Certbot

```bash
# Ubuntu/Debian
sudo apt install certbot python3-certbot-nginx

# RHEL/Fedora
sudo dnf install certbot python3-certbot-nginx
```

### 2. Create Host Nginx Config

Create `/etc/nginx/sites-available/travel-life`:

```nginx
server {
    listen 80;
    server_name travel.example.com;

    # Redirect all HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name travel.example.com;

    # TLS certificates (managed by Certbot)
    ssl_certificate /etc/letsencrypt/live/travel.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/travel.example.com/privkey.pem;

    # Modern TLS configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS - tell browsers to always use HTTPS (1 year)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Proxy to Docker frontend container
    location / {
        proxy_pass http://127.0.0.1:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        client_max_body_size 100M;
    }
}
```

### 3. Obtain Certificate and Enable

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/travel-life /etc/nginx/sites-enabled/

# Obtain certificate (Certbot will update the config automatically)
sudo certbot --nginx -d travel.example.com

# Test renewal
sudo certbot renew --dry-run
```

### 4. Update Environment Variables

In your `.env.production`, set the public URLs to HTTPS and tell the backend about the
extra proxy hop:

```bash
BASE_URL=https://travel.example.com
FRONTEND_URL=https://travel.example.com

# Host nginx + the bundled frontend nginx = 2 proxies in front of the backend.
# With the default of 1, every visitor shares one rate-limit bucket.
TRUST_PROXY=2
```

Leave `VITE_API_URL` and `VITE_UPLOAD_URL` at their relative defaults (`/api`,
`/uploads`): the bundled nginx proxies both to the backend, so a single hostname needs no
CORS configuration. Set `CORS_ORIGIN` only if the frontend and API are served from
different origins. The `proxy_pass` target above is the frontend container's host port
(`FRONTEND_PORT`, default `80`); change it if you moved the port. The API, database and
Nominatim ports are published on the loopback interface only by default
(`INTERNAL_BIND_ADDRESS=127.0.0.1`) and need no firewall exceptions.

The bundled frontend nginx already sends a Content-Security-Policy and HSTS on the app
shell, so you do not need to add a CSP at the host proxy.

## Option 2: Traefik (Docker-native)

If you prefer a Docker-native approach, add Traefik as a reverse proxy in `docker-compose.prod.yml`:

```yaml
services:
  traefik:
    image: traefik:v3.0
    command:
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--entrypoints.web.http.redirections.entrypoint.to=websecure"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.letsencrypt.acme.email=you@example.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - letsencrypt:/letsencrypt

  frontend:
    # ... existing config ...
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.frontend.rule=Host(`travel.example.com`)"
      - "traefik.http.routers.frontend.tls.certresolver=letsencrypt"
      - "traefik.http.middlewares.hsts.headers.stsSeconds=31536000"
      - "traefik.http.middlewares.hsts.headers.stsIncludeSubdomains=true"
      - "traefik.http.routers.frontend.middlewares=hsts"
    ports: []  # Remove direct port binding

volumes:
  letsencrypt:
```

As with Option 1, set `TRUST_PROXY=2` in `.env.production`: Traefik plus the bundled
frontend nginx are two proxies in front of the backend.

## Cookie Security

The refresh token cookie is already configured to require HTTPS in production —
no code changes are needed.

`backend/src/controllers/auth.controller.ts` does not set the cookie inline.
Instead it calls the `setRefreshTokenCookie` helper imported from `../http/cookies`:

```typescript
import { setRefreshTokenCookie } from '../http/cookies';

// ...inside the login/refresh handlers:
setRefreshTokenCookie(res, result.refreshToken);
```

The cookie options live in `backend/src/http/cookies.ts`, which reads all values
from `config.cookie`:

```typescript
res.cookie(REFRESH_TOKEN_COOKIE_NAME, token, {
  httpOnly: true,
  secure: config.cookie.secure,
  sameSite: config.cookie.sameSite,
  domain: config.cookie.domain,
  path: config.cookie.path,
  maxAge: config.cookie.maxAge,
});
```

The `config.cookie` object is defined in `backend/src/config/index.ts`, where
`secure` is derived from the environment:

```typescript
cookie: {
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  sameSite: /* COOKIE_SAME_SITE env, defaults to 'strict' */,
  domain: process.env.COOKIE_DOMAIN || undefined,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
}
```

Because `config.cookie.secure` resolves to `process.env.NODE_ENV === 'production'`,
the refresh token cookie is sent with the `Secure` flag automatically whenever the
app runs in production mode — so HTTPS cookie security works without any manual
configuration.

## Verifying Your Setup

After configuring HTTPS, verify:

```bash
# Check certificate
curl -vI https://travel.example.com 2>&1 | grep -E 'SSL|subject|expire'

# Check HSTS header
curl -sI https://travel.example.com | grep -i strict-transport

# Check HTTP redirect
curl -sI http://travel.example.com | grep -i location
```
