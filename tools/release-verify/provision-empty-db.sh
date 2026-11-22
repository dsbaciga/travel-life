#!/usr/bin/env bash
# Provisions an empty test database with a plain `prisma migrate deploy`, as
# prisma/migrations/README.md describes, then reports migration status and schema drift.
# Usage: provision-empty-db.sh <backend dir> <database name>
set -u
cd "$1" || exit 1
DB="$2"
export DATABASE_URL="postgresql://tl:tl_test_pw@127.0.0.1:55432/${DB}?schema=public"

echo "== prisma $(npx prisma --version 2>/dev/null | grep -E '^prisma ' | awk '{print $3}') -> ${DB}"

echo "== migrate deploy (every migration runs for real)"
npx prisma migrate deploy 2>&1 | grep -E "Applying|applied|Error|failed|No pending|pending" | head -100

echo "== migrate status"
npx prisma migrate status 2>&1 | tail -3

echo "== drift between database and schema.prisma (empty = none)"
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script 2>&1 | grep -v "^$" | head -30
