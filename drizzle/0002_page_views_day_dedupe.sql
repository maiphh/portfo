ALTER TABLE "page_views" ADD COLUMN "day" date DEFAULT (now() at time zone 'Asia/Ho_Chi_Minh')::date NOT NULL;--> statement-breakpoint
-- Backfill any existing rows from created_at, then keep one row per visitor/slug/day.
UPDATE "page_views" SET "day" = ("created_at" at time zone 'Asia/Ho_Chi_Minh')::date;--> statement-breakpoint
DELETE FROM "page_views" a USING "page_views" b WHERE a."visitor_hash" = b."visitor_hash" AND a."slug" = b."slug" AND a."day" = b."day" AND a."id" > b."id";--> statement-breakpoint
CREATE UNIQUE INDEX "page_views_visitor_slug_day_key" ON "page_views" USING btree ("visitor_hash","slug","day");
