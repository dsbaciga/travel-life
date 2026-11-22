#!/usr/bin/env bash
# Provisions an empty test database with a plain `prisma migrate deploy`, as
# prisma/migrations/README.md describes, then reports migration status and schema drift.
# Usage: provision-empty-db.sh <backend dir> <database name>
# Optional: TL_TEST_DB_PORT (default 55432), TL_MIGRATE_LOG (default: $TMPDIR/migrate-deploy-<db>.log).
# Exits non-zero, judged by prisma's exit code, if `migrate deploy` fails.
set -euo pipefail
cd "$1" || exit 1
DB="$2"
PORT="${TL_TEST_DB_PORT:-55432}"
LOG="${TL_MIGRATE_LOG:-${TMPDIR:-/tmp}/migrate-deploy-${DB}.log}"
export DATABASE_URL="postgresql://tl:tl_test_pw@127.0.0.1:${PORT}/${DB}?schema=public"

echo "== prisma $(npx prisma --version 2>/dev/null | grep -E '^prisma ' | awk '{print $3}' || true) -> ${DB} (port ${PORT})"

echo "== migrate deploy (every migration runs for real; full log: ${LOG})"
# Full output is shown and kept in the log; the exit code is prisma's own (pipefail).
if ! npx prisma migrate deploy 2>&1 | tee "$LOG"; then
  echo "FAILED: prisma migrate deploy exited non-zero (see output above or ${LOG})" >&2
  exit 1
fi

# The two checks below are reports; a non-zero status or a diff must not hide the output.
echo "== migrate status"
npx prisma migrate status 2>&1 | tail -3 || true

echo "== drift between database and schema.prisma (empty = none)"
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script 2>&1 | grep -v "^$" | head -30 || true
