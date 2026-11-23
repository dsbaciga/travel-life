/**
 * Fills Trip.coverColor for trips whose cover was set before the column existed.
 *
 * Samples each trip's current cover (uploaded image or library photo, Immich
 * included) and stores its dominant colour. Trips with no cover, or a cover that
 * cannot be read (file missing, Immich unreachable), are left null and counted.
 * Only trips with a cover and no colour yet are touched, so it is safe to re-run.
 *
 * Lives under `src/` (not `backend/scripts/`) so it is compiled into the
 * production image, which ships only `dist/`.
 *
 * Run in production:
 *   docker exec travel-life-backend node dist/scripts/backfillTripCoverColor.js [--dry-run] [--all]
 * Run in development:
 *   npx tsx src/scripts/backfillTripCoverColor.ts [--dry-run] [--all]
 *   --all  also recompute trips that already have a colour
 */

import prisma from '../config/database';
import { computeCoverColor } from '../services/tripCoverColor.service';

const DRY_RUN = process.argv.includes('--dry-run');
const ALL = process.argv.includes('--all');

async function main() {
  const trips = await prisma.trip.findMany({
    where: {
      OR: [{ coverImagePath: { not: null } }, { coverImageThumbnailPath: { not: null } }, { coverPhotoId: { not: null } }],
      ...(ALL ? {} : { coverColor: null }),
    },
    select: {
      id: true,
      userId: true,
      coverImagePath: true,
      coverImageThumbnailPath: true,
      coverPhoto: { select: { source: true, immichAssetId: true, localPath: true, thumbnailPath: true } },
    },
    orderBy: { id: 'asc' },
  });
  console.log(`${trips.length} trip(s) with a cover to sample${DRY_RUN ? ' (dry run)' : ''}`);

  let updated = 0;
  let noColor = 0;
  for (const trip of trips) {
    const coverColor = await computeCoverColor(trip);
    if (!coverColor) {
      noColor++;
      console.log(`  trip ${trip.id}: no usable colour`);
      continue;
    }
    console.log(`  trip ${trip.id}: ${coverColor}`);
    if (!DRY_RUN) {
      await prisma.trip.update({ where: { id: trip.id }, data: { coverColor } });
    }
    updated++;
  }

  console.log('\nDone.');
  console.log(`  ${DRY_RUN ? 'would update' : 'updated'}: ${updated}`);
  console.log(`  no usable colour:  ${noColor} (grey, unreadable, or Immich unreachable; left null)`);
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
