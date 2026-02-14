#!/bin/bash
# Script to fix failed Prisma migration on TrueNAS

echo "========================================="
echo "Fixing Failed Migration"
echo "========================================="
echo ""
echo "This script will resolve the failed migration:"
echo "  20251015_add_user_timezone"
echo ""
echo "Steps:"
echo "  1. Check if the migration was actually applied"
echo "  2. Mark it as successful in _prisma_migrations table"
echo "  3. Run any pending migrations"
echo ""

# Check if we're running in the backend container
if [ ! -f "/app/package.json" ]; then
    echo "ERROR: This script should be run inside the backend container"
    echo "Run: docker exec -it travel-life-backend bash"
    echo "Then run this script"
    exit 1
fi

# Check if timezone column exists
echo "Checking if timezone column exists in users table..."
COLUMN_EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='timezone';")

if [ -z "$COLUMN_EXISTS" ]; then
    echo "✗ Column does not exist - migration needs to be applied"
    echo ""
    echo "Applying the migration manually..."
    psql "$DATABASE_URL" -c "ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'UTC';"
    echo "✓ Migration applied"
else
    echo "✓ Column already exists - migration was applied"
fi

echo ""
echo "Marking migration as successful..."
psql "$DATABASE_URL" -c "UPDATE _prisma_migrations SET finished_at = NOW(), migration_name = '20251015_add_user_timezone', applied_steps_count = 1 WHERE migration_name = '20251015_add_user_timezone' AND finished_at IS NULL;"

echo "✓ Migration marked as successful"
echo ""
echo "Running prisma migrate deploy to apply any remaining migrations..."
npx prisma migrate deploy

echo ""
echo "========================================="
echo "Migration fix complete!"
echo "========================================="
