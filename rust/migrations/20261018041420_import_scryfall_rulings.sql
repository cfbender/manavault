-- import_scryfall_rulings
--
-- Card rulings from Scryfall's `rulings` bulk file, keyed by oracle id and
-- kept in file order (`id`). The catalog sync replaces every row, so cards no
-- longer fetch rulings from Scryfall one at a time and `rulings_uri` is unused.
-- Rows are filled by the next catalog sync.

CREATE TABLE "scryfall_rulings" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "oracle_id" TEXT NOT NULL, "source" TEXT, "published_at" TEXT, "comment" TEXT NOT NULL);
CREATE INDEX "scryfall_rulings_oracle_id_index" ON "scryfall_rulings" ("oracle_id");

ALTER TABLE "scryfall_cards" DROP COLUMN "rulings_uri";
