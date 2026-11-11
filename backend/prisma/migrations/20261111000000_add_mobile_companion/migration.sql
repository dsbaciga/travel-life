-- Mobile companion app: native push tokens and background GPS track points.

CREATE TABLE "mobile_push_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "device_name" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobile_push_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mobile_push_tokens_token_key" ON "mobile_push_tokens"("token");
CREATE INDEX "mobile_push_tokens_user_id_idx" ON "mobile_push_tokens"("user_id");

ALTER TABLE "mobile_push_tokens"
    ADD CONSTRAINT "mobile_push_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "trip_track_points" (
    "id" SERIAL NOT NULL,
    "trip_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "altitude" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_track_points_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trip_track_points_trip_id_user_id_recorded_at_key"
    ON "trip_track_points"("trip_id", "user_id", "recorded_at");
CREATE INDEX "trip_track_points_trip_id_recorded_at_idx" ON "trip_track_points"("trip_id", "recorded_at");
CREATE INDEX "trip_track_points_user_id_idx" ON "trip_track_points"("user_id");

ALTER TABLE "trip_track_points"
    ADD CONSTRAINT "trip_track_points_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "trip_track_points"
    ADD CONSTRAINT "trip_track_points_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
