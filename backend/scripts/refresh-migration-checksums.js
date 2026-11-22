#!/usr/bin/env node
/**
 * Re-record the checksums of migrations that were made idempotent after some databases
 * had already applied them (the "fresh database" fix; see prisma/migrations/README.md).
 *
 * Why: `prisma migrate deploy` ignores a changed checksum on an applied migration, but
 * `prisma migrate dev` reports "was modified after it was applied" and asks to reset the
 * database. Run this once on a development database before `migrate dev`.
 *
 * It only rewrites the `checksum` column of `_prisma_migrations` for the migrations listed
 * below, and only for rows that were already applied. It never runs migration SQL and never
 * touches your tables. Dry run by default; pass --apply to write.
 *
 *   DATABASE_URL=postgresql://... node scripts/refresh-migration-checksums.js          # dry run
 *   DATABASE_URL=postgresql://... node scripts/refresh-migration-checksums.js --apply
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const EDITED = [
  "20251015_add_user_timezone",
  "20251015_fix_lodging_schema",
  "20251017_add_text_color_to_tags",
  "20251025_add_checklists",
  "20251227_add_avatar_to_companions",
  "20251227_add_is_myself_to_companions",
  "20251229_add_route_distance_calculation",
  "20251230_add_cover_photo_to_albums",
  "20260102_remove_location_from_photos",
  "20260103_add_postgis_coordinates",
  "20260104_add_manual_order_to_activities",
  "20260109_add_location_parent_child_hierarchy",
  "20260113141725_add_route_geometry_to_cache",
  "20260113_add_api_key_settings",
  "20260114_add_entity_links",
  "20260120_add_trip_invitations",
  "20260122_remove_deprecated_location_fks",
  "20260124_add_video_support",
  "20260125_add_dismissed_validation_issues",
  "20260131_add_custom_map_style_setting",
  "20260131_add_travel_documents",
  "20260201_add_travel_partner_and_auto_share",
  "20260204_add_travel_partner_id_index",
  "20260206_add_password_version",
  "20260207_add_smtp_settings",
  "20260207_add_trip_series",
  "20260207_add_trip_types",
  "20260208_add_tag_sort_order",
  "20260215_add_route_cache_unique_index",
  "20260217_add_user_invitations",
  "20260220000000_add_cost_check_constraints_and_defaults",
  "20260301000000_add_email_import_system",
  "20260413000000_add_pdf_import_system",
  "20260417000000_add_llm_settings",
  "20260718000000_add_oidc_support",
  "20260719010000_add_trip_budget_and_expenses",
  "20260719020000_add_trip_share",
  "20260719040000_add_calendar_token",
  "20260719050000_add_push_subscriptions",
  "20260719060000_add_archive_and_favorites",
  "20260725010000_add_saved_links",
  "20260725020000_add_trip_cover_image",
  "20260726010000_add_email_ingest",
  "20260726020000_add_location_opening_hours",
  "20260727000000_add_currency_conversion",
  "20260727010000_add_preferred_maps_app",
];

const WHERE = 'migration_name = $2 AND finished_at IS NOT NULL AND rolled_back_at IS NULL';

async function main() {
  const apply = process.argv.includes('--apply');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    let changed = 0;
    for (const name of EDITED) {
      const file = path.join(__dirname, '..', 'prisma', 'migrations', name, 'migration.sql');
      const checksum = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      const { rows } = await client.query(`SELECT checksum FROM _prisma_migrations WHERE ${WHERE}`.replace('$2', '$1'), [name]);
      if (rows.length === 0 || rows.every((r) => r.checksum === checksum)) continue;
      changed++;
      console.log((apply ? 'updating ' : 'would update ') + name);
      if (apply) {
        await client.query(`UPDATE _prisma_migrations SET checksum = $1 WHERE ${WHERE}`, [checksum, name]);
      }
    }
    if (changed === 0) console.log('Nothing to do.');
    else if (apply) console.log(`Updated ${changed} checksum(s).`);
    else console.log(`${changed} checksum(s) differ; re-run with --apply.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
