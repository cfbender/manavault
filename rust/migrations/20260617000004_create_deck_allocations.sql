-- Migration 20260617000004 (create_deck_allocations).

CREATE TABLE "deck_allocations" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "deck_card_id" INTEGER NOT NULL CONSTRAINT "deck_allocations_deck_card_id_fkey" REFERENCES "deck_cards"("id") ON DELETE CASCADE, "collection_item_id" INTEGER NOT NULL CONSTRAINT "deck_allocations_collection_item_id_fkey" REFERENCES "collection_items"("id") ON DELETE CASCADE, "quantity" INTEGER DEFAULT 1 NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

CREATE INDEX "deck_allocations_deck_card_id_index" ON "deck_allocations" ("deck_card_id");

CREATE INDEX "deck_allocations_collection_item_id_index" ON "deck_allocations" ("collection_item_id");

CREATE UNIQUE INDEX "deck_allocations_deck_card_id_collection_item_id_index" ON "deck_allocations" ("deck_card_id", "collection_item_id");

