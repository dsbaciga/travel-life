#!/usr/bin/env bash
# Provisions an empty test database the way prisma/migrations/README.md describes:
# baseline schema, legacy migrations recorded as applied, then a normal deploy.
# Usage: provision-empty-db.sh <backend dir> <database name>
set -u
cd "$1" || exit 1
DB="$2"
export DATABASE_URL="postgresql://tl:tl_test_pw@127.0.0.1:55432/${DB}?schema=public"
CUTOFF="20260728030000_backfill_postgis_coordinates"

echo "== prisma $(npx prisma --version 2>/dev/null | grep -E '^prisma ' | awk '{print $3}') -> ${DB}"
npx prisma db execute --file prisma/migrations/00000000000000_init/migration.sql 2>&1 | tail -1

applied=0
for d in prisma/migrations/*/; do
  name="$(basename "$d")"
  if [[ "$name" < "$CUTOFF" || "$name" == "$CUTOFF" ]]; then
    npx prisma migrate resolve --applied "$name" >/dev/null 2>&1 && applied=$((applied + 1)) || echo "resolve failed: $name"
  fi
done
echo "recorded as applied: ${applied}"

echo "== migrate deploy (the rest run for real)"
npx prisma migrate deploy 2>&1 | grep -E "Applying|applied|Error|failed|No pending|pending" | head -30

echo "== migrate status"
npx prisma migrate status 2>&1 | tail -3

echo "== drift between database and schema.prisma (empty = none)"
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script 2>&1 | grep -v "^$" | head -30
