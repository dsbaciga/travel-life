#!/bin/sh
set -e

echo "Starting Travel Life Backend..."

# Wait for database to be ready
echo "Waiting for database to be ready..."
until npx prisma db execute --stdin <<EOF
SELECT 1;
EOF
do
  echo "Database is unavailable - sleeping"
  sleep 2
done

echo "Database is ready!"
echo ""

# Function to resolve a specific failed migration
resolve_migration() {
  local migration_name=$1
  echo "Resolving failed migration: $migration_name"

  # Try to resolve as rolled back first (safer - will re-run the migration)
  if npx prisma migrate resolve --rolled-back "$migration_name"; then
    echo "✓ Migration marked as rolled back: $migration_name"
    return 0
  else
    echo "✗ Failed to resolve migration: $migration_name"
    return 1
  fi
}

# Check for failed migrations and resolve them
echo "========================================="
echo "STEP 1: Checking for Failed Migrations"
echo "========================================="
echo "Running: npx prisma migrate status"
echo ""

MIGRATE_STATUS=$(npx prisma migrate status 2>&1 || true)
echo "$MIGRATE_STATUS"
echo ""

# Check if there are any failed migrations using multiple patterns
echo "Checking if output contains 'failed migration'..."

# Also check if prisma migrate deploy will fail by trying it first and checking the output
# This is necessary because migrate status doesn't always show "failed" even when a migration failed
TEST_DEPLOY_OUTPUT=$(npx prisma migrate deploy 2>&1 || true)

if echo "$TEST_DEPLOY_OUTPUT" | grep -qi "failed migration"; then
  echo "⚠ Found failed migration in deploy test output!"
  MIGRATE_STATUS="$TEST_DEPLOY_OUTPUT"
fi

if echo "$MIGRATE_STATUS" | grep -qi "failed migration"; then
  echo "========================================="
  echo "FAILED MIGRATIONS DETECTED!"
  echo "========================================="
  echo "$MIGRATE_STATUS"
  echo ""
  echo "Attempting automatic resolution..."

  # Try to resolve the specific migration mentioned in the error
  # Extract migration name from error message like "The `20251015_add_user_timezone` migration"
  # Using sed instead of grep -P since BusyBox grep doesn't support Perl regex
  FAILED_MIGRATION=$(echo "$MIGRATE_STATUS" | sed -n 's/.*`\([^`]*\)`.*failed.*/\1/p' | head -1)

  if [ -n "$FAILED_MIGRATION" ]; then
    echo "Found failed migration: $FAILED_MIGRATION"
    resolve_migration "$FAILED_MIGRATION"
  else
    # Fallback: try to find migration name from status output
    echo "Could not extract migration name from error. Checking status output..."

    # Try the specific migration we know about
    echo "Attempting to resolve known problematic migration: 20251015_add_user_timezone"
    resolve_migration "20251015_add_user_timezone"
  fi

  echo "Resolved failed migrations. Will retry deployment."
  echo ""
else
  echo "✓ No failed migrations detected. Proceeding with deployment."
  echo ""
fi

# Run database migrations
echo "========================================="
echo "STEP 2: Running Prisma Migrations"
echo "========================================="
set +e  # Don't exit on error
MIGRATION_OUTPUT=$(npx prisma migrate deploy 2>&1)
MIGRATION_EXIT_CODE=$?
set -e  # Re-enable exit on error

echo "$MIGRATION_OUTPUT"
echo ""
echo "Migration exit code: $MIGRATION_EXIT_CODE"

# Also check output for errors, not just exit code
if [ $MIGRATION_EXIT_CODE -ne 0 ] || echo "$MIGRATION_OUTPUT" | grep -qi "error:"; then
  echo ""
  echo "========================================="
  echo "ERROR: Migration deployment failed!"
  echo "========================================="

  # Check for database schema errors FIRST (takes priority over failed migration)
  if echo "$MIGRATION_OUTPUT" | grep -qi "relation.*does not exist"; then
    echo "ERROR: Database schema is missing (empty database or wrong schema)!"
    echo ""
    echo "This usually means:"
    echo "  1. The database is completely empty (first deployment)"
    echo "  2. The migrations table is corrupted"
    echo "  3. The database was reset but migrations table wasn't"
    echo ""
    echo "RECOMMENDED FIX:"
    echo "  Option 1: Reset the Prisma migrations table and start fresh"
    echo "    docker exec travel-life-backend npx prisma migrate reset --skip-seed"
    echo ""
    echo "  Option 2: Mark all migrations as applied if schema is correct"
    echo "    docker exec travel-life-backend npx prisma db push --accept-data-loss"
    echo ""
    echo "For now, attempting to push the schema directly..."

    if npx prisma db push --accept-data-loss --skip-generate; then
      echo "✓ Schema pushed successfully!"
      echo "Now marking all existing migrations as applied..."

      # Mark all migrations in the migrations directory as applied
      # This handles initial deployment where schema is created but migrations aren't tracked
      for migration_dir in /app/prisma/migrations/*/; do
        if [ -d "$migration_dir" ]; then
          migration_name=$(basename "$migration_dir")
          echo "  Marking migration as applied: $migration_name"
          npx prisma migrate resolve --applied "$migration_name" || true
        fi
      done

      echo "✓ Schema synchronized with migrations"
      echo ""
      echo "Verifying migration status..."
      npx prisma migrate status || true
    else
      echo "✗ Schema push failed. Continuing startup anyway..."
      echo "NOTE: Application will likely not work without proper database schema."
    fi
  elif echo "$MIGRATION_OUTPUT" | grep -qi "failed migration"; then
    echo "Still encountering failed migration error."
    echo ""
    echo "Attempting one more resolution attempt..."

    # Extract the failed migration name again using sed (BusyBox compatible)
    FAILED_MIGRATION=$(echo "$MIGRATION_OUTPUT" | sed -n 's/.*`\([^`]*\)`.*failed.*/\1/p' | head -1)
    if [ -z "$FAILED_MIGRATION" ]; then
      FAILED_MIGRATION="20251015_add_user_timezone"
    fi

    echo "Trying to mark as applied (migration may have actually succeeded): $FAILED_MIGRATION"
    npx prisma migrate resolve --applied "$FAILED_MIGRATION" || true

    echo ""
    echo "Retrying migration deployment one final time..."
    if npx prisma migrate deploy; then
      echo "✓ Migrations applied successfully on retry!"
    else
      echo "✗ Migrations still failing. Continuing startup anyway..."
      echo "NOTE: Application may not work correctly with pending migrations."
    fi
  elif echo "$MIGRATION_OUTPUT" | grep -qi "Could not find the migration file"; then
    echo "Missing migration file error detected."
    echo ""
    echo "This usually means the _prisma_migrations table references a migration that doesn't exist."
    echo "Attempting to clean up invalid migration references..."

    # Extract the migration name from the error message
    MISSING_MIGRATION=$(echo "$MIGRATION_OUTPUT" | sed -n 's/.*prisma\/migrations\/\([^\/]*\)\/.*/\1/p' | head -1)

    if [ -n "$MISSING_MIGRATION" ]; then
      echo "Found missing migration reference: $MISSING_MIGRATION"
      echo "Attempting to remove from _prisma_migrations table..."

      # Remove the invalid migration record directly from the database
      if npx prisma db execute --stdin <<EOF
DELETE FROM _prisma_migrations WHERE migration_name = '$MISSING_MIGRATION';
EOF
      then
        echo "✓ Removed invalid migration reference: $MISSING_MIGRATION"
        echo ""
        echo "Retrying migration deployment..."
        if npx prisma migrate deploy; then
          echo "✓ Migrations applied successfully after cleanup!"
        else
          echo "✗ Migrations still failing. Attempting schema push..."
          if npx prisma db push --accept-data-loss --skip-generate; then
            echo "✓ Schema pushed successfully!"
          else
            echo "✗ Schema push failed. Continuing startup anyway..."
          fi
        fi
      else
        echo "✗ Failed to remove invalid migration reference."
        echo "Continuing startup anyway to prevent crash loop..."
      fi
    else
      echo "Could not extract migration name from error."
      echo "Continuing startup anyway to prevent crash loop..."
    fi
  else
    echo "Migration failed for a different reason."
    echo "Continuing startup anyway to prevent crash loop..."
  fi
fi

# Prisma Client is already generated during build, skip to avoid permission issues
echo "Prisma Client already generated at build time. Skipping generate step."
echo ""
echo "Starting application..."
# Execute the main command (passed as arguments to this script)
exec "$@"
