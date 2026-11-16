-- Receipt photo attached to an expense (backlog #122). All columns are nullable, so existing
-- rows are unaffected. The path is server-generated ("/uploads/receipts/<uuid>.jpg").
ALTER TABLE "trip_expenses" ADD COLUMN "receipt_path" VARCHAR(255),
  ADD COLUMN "receipt_mime_type" VARCHAR(50),
  ADD COLUMN "receipt_size_bytes" INTEGER,
  ADD COLUMN "receipt_uploaded_at" TIMESTAMP(3);
