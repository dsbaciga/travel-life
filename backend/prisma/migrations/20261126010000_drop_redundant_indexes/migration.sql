-- Drop btree indexes whose columns are a leading-column prefix, in the same order and
-- sort/opclass, of another non-partial index or a unique constraint on the same table.
-- The wider index answers every lookup the narrow one did (equality or range on the
-- leading column), so the narrow one only costs write time and disk.
--
-- The list was produced from the migrated database's catalog (pg_index), not from
-- schema.prisma. Kept on purpose, although they look similar:
--   * entity_links(source_type, source_id) and entity_links(target_type, target_id):
--     the delete triggers of 20261120000000_add_activity_lodging_location_fk look links up
--     by these, and no other index leads with those columns.
--   * entity_links(trip_id, target_type, target_id): the unique key's fourth column is
--     target_type only after source_id, so it is not a prefix of it.
--   * every index whose leading column differs from the covering index's, every unique
--     index and primary key, and every partial, expression, GIN or GiST index.
-- All DROPs are IF EXISTS, so re-running is a no-op.

-- covered by activities(trip_id, manual_order)
DROP INDEX IF EXISTS "activities_trip_id_idx";
-- covered by unique custom_item_types(user_id, name)
DROP INDEX IF EXISTS "custom_item_types_user_id_idx";
-- covered by custom_items(trip_id, start_time)
DROP INDEX IF EXISTS "custom_items_trip_id_idx";
-- covered by unique dismissed_validation_issues(trip_id, issue_type, issue_key)
DROP INDEX IF EXISTS "dismissed_validation_issues_trip_id_idx";
-- covered by email_ingests(user_id, status)
DROP INDEX IF EXISTS "email_ingests_user_id_idx";
-- covered by entity_links(trip_id, source_type, source_id) and the unique key
DROP INDEX IF EXISTS "entity_links_trip_id_idx";
-- covered by the unique key entity_links(trip_id, source_type, source_id, target_type, target_id)
DROP INDEX IF EXISTS "entity_links_trip_id_source_type_source_id_idx";
-- covered by unique food_log_entry_photos(entry_id, photo_id)
DROP INDEX IF EXISTS "food_log_entry_photos_entry_id_idx";
-- covered by language_phrases(language_code, category)
DROP INDEX IF EXISTS "language_phrases_language_code_idx";
-- covered by locations(trip_id, country_code)
DROP INDEX IF EXISTS "locations_trip_id_idx";
-- covered by pdf_imports(user_id, status)
DROP INDEX IF EXISTS "pdf_imports_user_id_idx";
-- covered by unique photo_album_assignments(album_id, photo_id)
DROP INDEX IF EXISTS "photo_album_assignments_album_id_idx";
-- covered by photos(trip_id, taken_at), photos(trip_id, is_favorite) and unique photos(trip_id, immich_asset_id)
DROP INDEX IF EXISTS "photos_trip_id_idx";
-- covered by saved_links(user_id, trip_id)
DROP INDEX IF EXISTS "saved_links_user_id_idx";
-- covered by unique trip_expense_splits(expense_id, companion_id)
DROP INDEX IF EXISTS "trip_expense_splits_expense_id_idx";
-- covered by trip_expenses(trip_id, date)
DROP INDEX IF EXISTS "trip_expenses_trip_id_idx";
-- covered by unique trip_invitations(token) (trip_invitations_token_key)
DROP INDEX IF EXISTS "trip_invitations_token_idx";
-- covered by unique trip_languages(trip_id, language_code)
DROP INDEX IF EXISTS "trip_languages_trip_id_idx";
-- covered by user_invitations(email, status)
DROP INDEX IF EXISTS "user_invitations_email_idx";
-- covered by unique user_invitations(token) (user_invitations_token_key)
DROP INDEX IF EXISTS "user_invitations_token_idx";
-- covered by unique visa_requirements(passport_country, destination_country)
DROP INDEX IF EXISTS "visa_requirements_passport_country_idx";
-- covered by unique weather_data(trip_id, date)
DROP INDEX IF EXISTS "weather_data_trip_id_idx";
