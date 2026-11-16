-- Multi-City Trip Planner: the ordered route plan of a trip.
-- CreateTable
CREATE TABLE "trip_stops" (
    "id" SERIAL NOT NULL,
    "trip_id" INTEGER NOT NULL,
    "location_id" INTEGER,
    "name" VARCHAR(200) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "position" INTEGER NOT NULL,
    "nights" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_stops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_stops_trip_id_position_idx" ON "trip_stops"("trip_id", "position");

-- CreateIndex
CREATE INDEX "trip_stops_location_id_idx" ON "trip_stops"("location_id");

-- AddForeignKey
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Coordinate ranges and nights are validated by the API; these keep the table honest
-- if a row is ever written another way. Prisma cannot represent CHECK constraints.
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_latitude_range" CHECK ("latitude" BETWEEN -90 AND 90);
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_longitude_range" CHECK ("longitude" BETWEEN -180 AND 180);
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_nights_range" CHECK ("nights" IS NULL OR "nights" BETWEEN 0 AND 365);
