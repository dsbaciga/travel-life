#!/bin/sh
set -e

echo "========================================="
echo "Database Migration & Startup Script"
echo "========================================="

# Wait for database to be ready using pg_isready
echo "Waiting for database to be ready..."

# Attempt to extract host and port for a more reliable check
# Handle both standard hostnames and URIs
DB_HOST="db"
DB_PORT="5432"

DB_USER=""
DB_PASSWORD=""
DB_NAME=""

if [ -n "$DATABASE_URL" ]; then
  # Extract connection components from postgresql://user:pass@host:port/db
  # This avoids passing the full URL as a command argument (visible in /proc)
  EXTRACTED_HOST=$(printf '%s' "$DATABASE_URL" | sed -e 's|.*@||' -e 's|/.*||' -e 's|:.*||')
  EXTRACTED_PORT=$(printf '%s' "$DATABASE_URL" | sed -e 's|.*@||' -e 's|/.*||' | grep ":" | cut -d: -f2)
  DB_USER=$(printf '%s' "$DATABASE_URL" | sed -e 's|postgresql://||' -e 's|:.*||')
  DB_PASSWORD=$(printf '%s' "$DATABASE_URL" | sed -e 's|postgresql://[^:]*:||' -e 's|@.*||')
  DB_NAME=$(printf '%s' "$DATABASE_URL" | sed -e 's|.*@[^/]*/||' -e 's|?.*||')

  if [ -n "$EXTRACTED_HOST" ]; then DB_HOST="$EXTRACTED_HOST"; fi
  if [ -n "$EXTRACTED_PORT" ]; then DB_PORT="$EXTRACTED_PORT"; fi
fi

echo "Checking connectivity to $DB_HOST on port $DB_PORT..."

# Show more debug info if it fails
ATTEMPT=0
until pg_isready -h "$DB_HOST" -p "$DB_PORT"; do
  ATTEMPT=$((ATTEMPT + 1))
  echo "Database at $DB_HOST:$DB_PORT is unavailable (attempt $ATTEMPT) - sleeping"
  
  # On TrueNAS, sometimes the service name 'db' takes a moment to propagate in DNS
  if [ $ATTEMPT -eq 5 ]; then
    echo "Resolution check for '$DB_HOST':"
    getent hosts "$DB_HOST" || echo "  ! Could not resolve '$DB_HOST'"
    echo "Resolution check for 'travel-life-db':"
    getent hosts travel-life-db || echo "  ! Could not resolve 'travel-life-db'"
  fi
  
  sleep 2
done

echo "Database is ready!"

# Ensure Prisma Client is generated (safety check for TrueNAS compatibility)
echo "Verifying Prisma Client..."
if [ ! -d "/app/node_modules/.prisma/client" ]; then
  echo "Prisma Client not found. Generating..."
  npx prisma generate
else
  echo "Prisma Client exists."
fi

# Check if PostGIS extension is installed using psql
echo "Checking for PostGIS extension..."
if [ -n "$DATABASE_URL" ]; then
  # Use PGPASSWORD env var instead of passing full URL in command args (visible in /proc)
  PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS postgis;" > /dev/null 2>&1 || true
else
  echo "⚠ DATABASE_URL is not set. Cannot check PostGIS extension."
fi

# Run Prisma migrations
echo "Running prisma migrate deploy..."
cd /app
if npx prisma migrate deploy; then
  echo "✓ Migrations applied successfully."
else
  echo "✗ Migration deployment failed. Refusing to start with inconsistent schema."
  echo "  Please fix the migration issues manually before restarting."
  echo "  See: https://www.prisma.io/docs/guides/deployment/deploy-database-changes-with-prisma-migrate"
  exit 1
fi

echo "========================================="
echo "Running Manual Migrations..."
echo "========================================="

# Run manual SQL migrations (data migrations that aren't handled by Prisma)
# These are idempotent scripts that track their own execution state
MANUAL_MIGRATIONS_DIR="/app/scripts/manual-migrations"
if [ -d "$MANUAL_MIGRATIONS_DIR" ]; then
  for migration_file in "$MANUAL_MIGRATIONS_DIR"/*.sql; do
    if [ -f "$migration_file" ]; then
      migration_name=$(basename "$migration_file")
      echo "Running manual migration: $migration_name"
      if [ -n "$DATABASE_URL" ]; then
        # Use PGPASSWORD env var to avoid leaking credentials in process listings
        MIGRATION_OUTPUT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration_file" 2>&1)
        MIGRATION_EXIT=$?
        if [ $MIGRATION_EXIT -eq 0 ]; then
          echo "  ✓ $migration_name completed"
        else
          echo "  ⚠ $migration_name had issues (may already be applied)"
          # Show error details (filter out lines containing the connection string)
          echo "$MIGRATION_OUTPUT" | grep -iv "postgresql://" | head -5 || true
        fi
      else
        echo "  ⚠ DATABASE_URL is not set. Skipping manual migration: $migration_name"
      fi
    fi
  done
  echo "✓ Manual migrations check complete."
else
  echo "No manual migrations directory found, skipping."
fi

echo "========================================="
echo "Setting up directories..."
echo "========================================="

# Ensure uploads directories exist with proper permissions
# In production, these should already exist from Dockerfile.prod
# This handles development and edge cases where they may not exist

# On TrueNAS and similar systems, bind mounts may replace the directories
# created during Docker build. We need to handle this gracefully.

UPLOAD_DIRS="/app/uploads/temp /app/uploads/photos"
UPLOAD_READY=true

# Only attempt chown if running as root (uid 0)
# Non-root users (like 'node' in production) cannot change ownership
if [ "$(id -u)" = "0" ]; then
  # Running as root - can create dirs and fix permissions
  for dir in $UPLOAD_DIRS; do
    if [ ! -d "$dir" ]; then
      mkdir -p "$dir" 2>/dev/null || true
    fi
  done
  chown -R node:node /app/uploads 2>/dev/null || true
  chmod -R 755 /app/uploads 2>/dev/null || true
else
  # Running as non-root - directories should already exist from Dockerfile
  # or the host volume. Try to create them silently if they don't exist.
  for dir in $UPLOAD_DIRS; do
    if [ ! -d "$dir" ]; then
      # Use subshell to ensure errors are fully captured and suppressed
      ( mkdir -p "$dir" ) 2>/dev/null || true
    fi
  done
fi

# Verify the directories exist (they might have been pre-created on host)
for dir in $UPLOAD_DIRS; do
  if [ ! -d "$dir" ]; then
    UPLOAD_READY=false
  fi
done

# Verify the upload directory is writable
if [ "$UPLOAD_READY" = "true" ] && touch /app/uploads/temp/.write-test 2>/dev/null; then
  rm -f /app/uploads/temp/.write-test
  echo "✓ Upload directories ready."
else
  echo ""
  echo "⚠ WARNING: Upload directories not fully accessible."
  echo "  Current user: $(id)"
  echo "  Directory status:"
  ls -la /app/uploads/ 2>/dev/null || echo "  Cannot list /app/uploads/"
  echo ""
  echo "  For TrueNAS/NAS systems, fix host directory permissions:"
  echo "    sudo chown -R 1000:1000 /mnt/pool/travel-life/uploads"
  echo "    sudo chmod -R 755 /mnt/pool/travel-life/uploads"
  echo ""
  echo "  Or set container to run as root temporarily to fix permissions:"
  echo "    docker exec -u root travel-life-backend chown -R node:node /app/uploads"
  echo ""
  echo "  Continuing startup - photo uploads may fail until permissions are fixed."
  echo ""
fi

echo "========================================="
echo "Starting Application..."
echo "========================================="

# Start the application
# If running as root (production with su-exec available), drop to node user for security
if [ "$(id -u)" = "0" ] && command -v su-exec >/dev/null 2>&1; then
  echo "Dropping privileges to 'node' user..."
  exec su-exec node "$@"
elif [ "$(id -u)" = "0" ]; then
  # Running as root but su-exec is not available - refuse to run as root for security
  echo "ERROR: Running as root but su-exec is not available."
  echo "  The application must not run as root for security reasons."
  echo "  Either install su-exec or run the container with --user node."
  exit 1
else
  # Already running as non-root user (e.g., 'node' via Docker USER directive)
  exec "$@"
fi

