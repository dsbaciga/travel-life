-- Photos attached to food log entries.
--
-- Purely additive: one new table, no existing table or row is touched. A food
-- photo is an ordinary trip photo; this join records which entries display it.
-- Deleting an entry or a photo removes only the link row (ON DELETE CASCADE).

-- CreateTable
CREATE TABLE "food_log_entry_photos" (
    "id" SERIAL NOT NULL,
    "entry_id" INTEGER NOT NULL,
    "photo_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_log_entry_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "food_log_entry_photos_entry_id_idx" ON "food_log_entry_photos"("entry_id");

-- CreateIndex
CREATE INDEX "food_log_entry_photos_photo_id_idx" ON "food_log_entry_photos"("photo_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_log_entry_photos_entry_id_photo_id_key" ON "food_log_entry_photos"("entry_id", "photo_id");

-- AddForeignKey
ALTER TABLE "food_log_entry_photos" ADD CONSTRAINT "food_log_entry_photos_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "food_log_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_log_entry_photos" ADD CONSTRAINT "food_log_entry_photos_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
