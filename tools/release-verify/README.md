# Release verification against a real database

The backend unit tests mock Prisma, so they pass on code that fails against a real
database. These scripts run the built backend against real PostgreSQL and compare a
candidate build with the current release. Use them before a release that touches
dependencies, Prisma, validation or anything on the data path.

Nothing here touches your development database. Everything runs against copies in a
throwaway container that you delete afterwards.

## What each script does

| Script | What it checks |
| ------ | -------------- |
| `provision-empty-db.sh` | Builds an empty database the way `backend/prisma/migrations/README.md` describes, then reports migration status and schema drift |
| `api-smoke.cjs` | 66 API steps as a new user: sign-up, token refresh, create/edit/delete on every main entity, location writes, raw-SQL reads, share link and calendar feed without sign-in, trip duplication, backup and restore |
| `compare-reads.cjs` | Asks the old and the new backend the same read questions about copies of the same data, for every user and trip, and lists every response that differs |
| `backup-roundtrip.cjs` | For each existing user: backup, restore over their data, backup again, and compare |
| `batch-nov-2026-smoke.cjs` | About 400 assertions on the November 2026 batch (expense splits, receipts, photo favorites, loyalty programs, trip stops, units, trip comparison, CSV import, journal day draft, Immich sync, booking deadlines), then a backup round trip (replace and merge), trip duplication and mobile sync |
| `sharing-and-uploads.cjs` | Three users (owner, collaborator, stranger) at each permission level, plus photo and video uploads with real files and who may open them |

## Running it

Build both images and start a throwaway database:

```bash
docker network create tl-verify-net
docker run -d --name tl-verify-db --network tl-verify-net \
  -e POSTGRES_USER=tl -e POSTGRES_PASSWORD=tl_test_pw -e POSTGRES_DB=postgres \
  -p 127.0.0.1:55432:5432 postgis/postgis:16-3.4

# candidate build
docker build -f backend/Dockerfile.prod -t tl-verify-be:new backend

# current release, from main
mkdir -p /tmp/tl-main && git archive main backend | tar -x -C /tmp/tl-main
docker build -f /tmp/tl-main/backend/Dockerfile.prod -t tl-verify-be:old /tmp/tl-main/backend
```

Copy the data you want to test with into two databases, one per build. From the dev
container:

```bash
docker exec travel-life-db sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges -Fc' > /tmp/tl.dump

for db in tl_old tl_new; do
  docker exec tl-verify-db psql -U tl -d postgres -c "CREATE DATABASE $db"
  docker exec -i tl-verify-db pg_restore -U tl -d $db --no-owner --no-privileges < /tmp/tl.dump
done
```

Start both backends with the same secrets, so one token works on both. Avoid ports
5060 and 5061: Node refuses to fetch from them.

```bash
COMMON="-e JWT_SECRET=verify-old-vs-new-shared-secret-0001-abcdefgh \
  -e JWT_REFRESH_SECRET=verify-old-vs-new-shared-refresh-0002-abcdefg \
  -e NODE_ENV=production -e AI_ENABLED=false -e BACKUP_RATE_LIMIT_MAX=1000 \
  -e NOMINATIM_URL=http://127.0.0.1:9"

docker run -d --name tl-verify-be-old --network tl-verify-net -p 127.0.0.1:5071:5000 \
  -e DATABASE_URL="postgresql://tl:tl_test_pw@tl-verify-db:5432/tl_old?schema=public" $COMMON tl-verify-be:old
docker run -d --name tl-verify-be-new --network tl-verify-net -p 127.0.0.1:5072:5000 \
  -e DATABASE_URL="postgresql://tl:tl_test_pw@tl-verify-db:5432/tl_new?schema=public" $COMMON tl-verify-be:new
```

Each container applies pending migrations on start; check `docker logs` for
`Migrations applied successfully`.

Then, from the repository root (the scripts borrow `jsonwebtoken` from
`backend/node_modules`, so run `npm ci` in `backend/` first):

```bash
USERS=$(docker exec tl-verify-db psql -U tl -d tl_new -Atc \
  "select json_agg(json_build_object('id',id,'email',email,'passwordVersion',password_version)) from users")
SECRET=verify-old-vs-new-shared-secret-0001-abcdefgh
NM="$PWD/backend/node_modules"

node tools/release-verify/compare-reads.cjs http://127.0.0.1:5071 http://127.0.0.1:5072 "$SECRET" "$NM" "$USERS"
node tools/release-verify/api-smoke.cjs http://127.0.0.1:5071 /tmp/old.json
node tools/release-verify/api-smoke.cjs http://127.0.0.1:5072 /tmp/new.json
node tools/release-verify/backup-roundtrip.cjs http://127.0.0.1:5072 "$SECRET" "$NM" "$USERS"
node tools/release-verify/sharing-and-uploads.cjs http://127.0.0.1:5072 photo.jpg clip.mp4
```

`sharing-and-uploads.cjs` needs a real JPEG and a real MP4; any small ones will do.

## Reading the results

- `compare-reads.cjs` should list only differences you intended. Timestamps a few
  milliseconds apart on rows created lazily at first read are not a regression.
- `api-smoke.cjs` should report `0 failed` on the candidate. Run it on the old build
  too: a step that fails there and passes on the candidate is a bug the release fixes.
- `backup-roundtrip.cjs` should say `content identical after restore` for every user.
- A removed collaborator can still open a photo file for up to 60 seconds; file access
  is cached that long on purpose.

## Cleaning up

```bash
docker rm -f tl-verify-be-old tl-verify-be-new tl-verify-db
docker network rm tl-verify-net
docker rmi tl-verify-be:old tl-verify-be:new
rm -f /tmp/tl.dump
```

## The November 2026 batch script

`batch-nov-2026-smoke.cjs` needs a backend that runs from `backend/` (receipts and photos are
written to `backend/uploads/`, which is git-ignored) and a database in a container it can reach
with `docker exec` (default container `tl-batch-verify`, database `batch`, user `tl`; pass another
container name as the third argument). It registers four users (owner, editor, view-only
collaborator, stranger) and checks permissions as well as data.

```bash
bash tools/release-verify/provision-empty-db.sh "$PWD/backend" batch
cd backend && npm run build
DATABASE_URL='postgresql://tl:tl_test_pw@127.0.0.1:55432/batch?schema=public' JWT_SECRET=<32+ chars> JWT_REFRESH_SECRET=<32+ chars> PORT=5077 NODE_ENV=production AI_ENABLED=false NOMINATIM_URL=http://127.0.0.1:9 BACKUP_RATE_LIMIT_MAX=1000 AI_RATE_LIMIT_MAX=1000 node dist/index.js &
cd .. && node tools/release-verify/batch-nov-2026-smoke.cjs http://127.0.0.1:5077 /tmp/batch.json
```

Notes:

- Run it on a fresh database; it creates users with random names, so a re-run on a used database
  also works, but the duplication and backup checks read "the first trip called Batch trip".
- The fake-Immich section starts a small Immich stand-in on 127.0.0.1 and saves its URL for the
  owner. The backend refuses private and loopback Immich URLs unless the operator opts in, and
  the script does not work around that: without the opt-in the section is reported as `SKIP` and
  only the no-Immich checks run. Run it against a backend where you have deliberately allowed
  private integration URLs (see `backend/CLAUDE.md`) to exercise the full flows.
- Receipts and photos are cleaned up by the script's own deletes only partly; remove
  `backend/uploads/receipts`, `photos`, `thumbnails` and `videos` afterwards.

## What this does not cover

The web interface (drive it in a browser against the frontend image), the mobile app,
a real Immich server, PDF import, email ingest, push delivery and the scheduled jobs.
