-- Migration 20260810120000 (create_vendor_prices).

CREATE TABLE "vendor_prices" ("vendor" TEXT, "scryfall_id" TEXT, "finish" TEXT, "price_cents" INTEGER NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, PRIMARY KEY ("vendor","scryfall_id","finish"));

CREATE INDEX "vendor_prices_scryfall_id_index" ON "vendor_prices" ("scryfall_id");

CREATE INDEX "vendor_prices_vendor_updated_at_index" ON "vendor_prices" ("vendor", "updated_at");

CREATE TABLE "pricing_settings" ("id" INTEGER PRIMARY KEY, "source" TEXT DEFAULT 'scryfall' NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

