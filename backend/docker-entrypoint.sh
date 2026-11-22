#!/bin/sh
# shellcheck disable=SC2016  # backticks in the sed patterns are literal (Prisma quotes names with them)
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

# Run database migrations (exactly once).
#
# This script never repairs a failed migration on its own. In particular it never runs
# `prisma db push` (which can drop data and ignores CHECK constraints and triggers that
# only exist in migration SQL), never runs `prisma migrate resolve`, and never edits
# `_prisma_migrations`. If `migrate deploy` fails, the container stops so that it does not
# serve traffic on a half-migrated schema. Recovery is a deliberate manual step; see
# backend/prisma/migrations/README.md.
echo "========================================="
echo "Running Prisma Migrations (prisma migrate deploy)"
echo "========================================="

MIGRATION_LOG=$(mktemp)
set +e
npx prisma migrate deploy > "$MIGRATION_LOG" 2>&1
MIGRATION_EXIT_CODE=$?
set -e

cat "$MIGRATION_LOG"
echo ""

if [ "$MIGRATION_EXIT_CODE" -ne 0 ]; then
  # Best effort: name the migration Prisma reports as failing. BusyBox compatible (no grep -P).
  FAILED_MIGRATION=$(sed -n 's/^Migration name: \(.*\)$/\1/p' "$MIGRATION_LOG" | head -1)
  if [ -z "$FAILED_MIGRATION" ]; then
    FAILED_MIGRATION=$(sed -n 's/.*Applying migration `\([^`]*\)`.*/\1/p' "$MIGRATION_LOG" | head -1)
  fi
  if [ -z "$FAILED_MIGRATION" ]; then
    FAILED_MIGRATION=$(sed -n 's/.*The `\([^`]*\)` migration.*failed.*/\1/p' "$MIGRATION_LOG" | head -1)
  fi
  rm -f "$MIGRATION_LOG"

  echo "========================================="
  echo "ERROR: prisma migrate deploy failed (exit code $MIGRATION_EXIT_CODE)."
  echo "========================================="
  if [ -n "$FAILED_MIGRATION" ]; then
    echo "Failed migration: $FAILED_MIGRATION"
  else
    echo "Prisma did not name a failed migration; see its output above."
  fi
  echo ""
  echo "This container did NOT modify the database to work around the failure: it did not"
  echo "run 'prisma db push', 'prisma migrate resolve', or edit _prisma_migrations."
  echo "Refusing to start the application on a half-migrated schema."
  echo ""
  echo "To recover:"
  echo "  1. Read the Prisma error above and fix the cause (or restore from a backup taken"
  echo "     before the upgrade; back up before retrying)."
  echo "  2. Mark the failed migration as rolled back so it can be retried (run this in a"
  echo "     one-off container, since this one has exited; see the README below):"
  echo "       npx prisma migrate resolve --rolled-back ${FAILED_MIGRATION:-<migration_name>}"
  echo "  3. Restart the backend container; it will run 'prisma migrate deploy' again."
  echo ""
  echo "Details and the full procedure: backend/prisma/migrations/README.md"
  echo "(see 'Recovering after the baseline has already failed (P3009)')."
  exit 1
fi

rm -f "$MIGRATION_LOG"
echo "Migrations applied successfully."
echo ""

# Prisma Client is already generated during build, skip to avoid permission issues
echo "Prisma Client already generated at build time. Skipping generate step."
echo ""
echo "Starting application..."
# Execute the main command (passed as arguments to this script)
exec "$@"
