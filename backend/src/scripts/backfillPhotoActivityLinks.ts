/**
 * Links existing photos to activities by capture time, across trips, with no
 * review step. The same matching as the "Link to activities" button on a
 * trip's Photos tab: a photo is linked only to an activity it was taken during,
 * or to an all-day activity on the same date.
 *
 * Photos that already have an activity link are left alone, so it is safe to
 * re-run and a second run adds nothing.
 *
 * Lives under `src/` (not `backend/scripts/`) so it is compiled into the
 * production image, which ships only `dist/`.
 *
 * Run in production:
 *   docker exec travel-life-backend node dist/scripts/backfillPhotoActivityLinks.js [options]
 * Run in development:
 *   npx tsx src/scripts/backfillPhotoActivityLinks.ts [options]
 *
 * Options:
 *   --dry-run        Report what would be linked without writing anything
 *   --trip=<id>      Only this trip
 *   --user=<id>      Only trips owned by this user
 */

import prisma from '../config/database';
import { backfillTripPhotoActivityLinks } from '../services/photoAutoLink.service';

const DRY_RUN = process.argv.includes('--dry-run');

/** Reads `--name=<positive integer>`; exits on a malformed value rather than ignoring it. */
function numberOption(name: string): number | undefined {
  const arg = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (!arg) return undefined;
  const parsed = Number(arg.slice(name.length + 3));
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.error(`Invalid --${name}: expected a positive integer`);
    process.exit(1);
  }
  return parsed;
}

async function main(): Promise<void> {
  const tripId = numberOption('trip');
  const userId = numberOption('user');

  const trips = await prisma.trip.findMany({
    where: { ...(tripId ? { id: tripId } : {}), ...(userId ? { userId } : {}) },
    select: { id: true, title: true, userId: true },
    orderBy: { id: 'asc' },
  });

  console.log(
    `${DRY_RUN ? '[dry run] ' : ''}Matching photos to activities in ${trips.length} trip(s)`
  );

  const totals = { matched: 0, created: 0, tripsChanged: 0 };
  for (const trip of trips) {
    const result = await backfillTripPhotoActivityLinks(trip.id, trip.userId, { dryRun: DRY_RUN });
    if (result.totalPhotos === 0) continue;

    totals.matched += result.matchedPhotos;
    totals.created += result.created;
    if (result.matchedPhotos > 0) totals.tripsChanged++;

    console.log(
      `  Trip ${trip.id} "${trip.title}": ` +
        `${DRY_RUN ? 'would link' : 'linked'} ${DRY_RUN ? result.matchedPhotos : result.created} ` +
        `of ${result.totalPhotos} photos ` +
        `(${result.alreadyLinkedPhotos} already linked, ` +
        `${result.unmatchedPhotos} fit no activity, ` +
        `${result.photosWithoutTime} have no capture time)`
    );
  }

  console.log(
    DRY_RUN
      ? `Done. Would link ${totals.matched} photo(s) across ${totals.tripsChanged} trip(s). Nothing was written.`
      : `Done. Linked ${totals.created} photo(s) across ${totals.tripsChanged} trip(s).`
  );
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
