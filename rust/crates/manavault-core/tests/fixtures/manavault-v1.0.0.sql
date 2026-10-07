-- ManaVault v1.0.0 database: a database from the v1.0.0 release (its own 34 migrations),
-- owner data inserted in v1.0.0's formats; dumped with sqlite3 .dump. Used by db::tests.
/* WARNING: Script requires that SQLITE_DBCONFIG_DEFENSIVE be disabled */
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "schema_migrations" ("version" INTEGER PRIMARY KEY, "inserted_at" TEXT);
INSERT INTO schema_migrations VALUES(20260101000000,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260102000000,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260103000000,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260103000001,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260105000000,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260616000000,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260617000000,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260617000001,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260617000002,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260617000003,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260617000004,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260617000005,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260620000000,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260620000001,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260620000002,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260621000000,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260621000001,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260622000000,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260622000001,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260622000002,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260622000003,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260623000000,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260623000001,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260624000000,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260625000000,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260625000001,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260625000002,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260627000000,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260703000000,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260703000001,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260708000000,'2026-10-07T14:01:47');
INSERT INTO schema_migrations VALUES(20260708000001,'2026-10-07T14:01:48');
INSERT INTO schema_migrations VALUES(20260708000002,'2026-10-07T14:01:48');
INSERT INTO schema_migrations VALUES(20260708000003,'2026-10-07T14:01:48');
CREATE TABLE IF NOT EXISTS "scryfall_cards" ("oracle_id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "type_line" TEXT, "oracle_text" TEXT, "color_identity" TEXT DEFAULT '[]' NOT NULL, "legalities" TEXT DEFAULT '{}' NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "mana_cost" TEXT, "cmc" NUMERIC, "colors" TEXT DEFAULT '[]' NOT NULL, "oracle_tags" TEXT DEFAULT '[]' NOT NULL, "deck_category" TEXT, "deck_themes" TEXT DEFAULT '[]' NOT NULL, "rulings_uri" TEXT, "game_changer" INTEGER DEFAULT false NOT NULL);
INSERT INTO scryfall_cards VALUES('oracle-krenko','Krenko, Mob Boss','Legendary Creature — Goblin Warrior','{T}: Create X 1/1 red Goblin creature tokens.','["R"]','{"commander":"legal"}','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z','{2}{R}{R}',4,'["R"]','[]',NULL,'[]',NULL,0);
INSERT INTO scryfall_cards VALUES('oracle-bolt','Lightning Bolt','Instant','Lightning Bolt deals 3 damage to any target.','["R"]','{"commander":"legal"}','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z','{R}',1,'["R"]','[]',NULL,'[]',NULL,0);
INSERT INTO scryfall_cards VALUES('oracle-counterspell','Counterspell','Instant','Counter target spell.','["U"]','{"commander":"legal"}','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z','{U}{U}',2,'["U"]','[]',NULL,'[]',NULL,0);
INSERT INTO scryfall_cards VALUES('oracle-vault','Lim-Dûl''s Vault','Instant','Look at the top five cards of your library.','["U","B"]','{}','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z','{U}{B}',2,'["U","B"]','[]',NULL,'[]',NULL,0);
INSERT INTO scryfall_cards VALUES('oracle-aether','Æther Vial','Artifact','At the beginning of your upkeep, you may put a charge counter on Æther Vial.','[]','{}','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z','{1}',1,'[]','[]',NULL,'[]',NULL,0);
INSERT INTO scryfall_cards VALUES('oracle-orphan','Orphan Card','Instant',NULL,'[]','{}','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z',NULL,NULL,'[]','[]',NULL,'[]',NULL,0);
CREATE TABLE IF NOT EXISTS "scryfall_printings" ("scryfall_id" TEXT PRIMARY KEY, "oracle_id" TEXT NOT NULL CONSTRAINT "scryfall_printings_oracle_id_fkey" REFERENCES "scryfall_cards"("oracle_id") ON DELETE CASCADE, "set_code" TEXT NOT NULL, "set_name" TEXT, "collector_number" TEXT NOT NULL, "lang" TEXT NOT NULL, "finishes" TEXT DEFAULT '[]' NOT NULL, "image_uris" TEXT DEFAULT '{}' NOT NULL, "prices" TEXT DEFAULT '{}' NOT NULL, "released_at" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "rarity" TEXT, "flavor_name" TEXT, "flavor_text" TEXT);
INSERT INTO scryfall_printings VALUES('print-krenko','oracle-krenko','m13','Magic 2013','145','en','["nonfoil","foil"]','{"normal":"https://example.test/krenko.jpg"}','{"usd":"2.50"}','2012-07-13','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z','rare',NULL,NULL);
INSERT INTO scryfall_printings VALUES('print-bolt','oracle-bolt','sld','Secret Lair Drop','9','en','["nonfoil"]','{"normal":"https://example.test/bolt.jpg"}','{"usd":"1.00"}','2021-01-01','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z','rare','Kiln’s  Ritual','Crackle.');
INSERT INTO scryfall_printings VALUES('print-counterspell','oracle-counterspell','lea','Limited Edition Alpha','54','en','["nonfoil"]','{}','{"usd":"500.00"}','1993-08-05','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z','uncommon',NULL,NULL);
INSERT INTO scryfall_printings VALUES('print-vault','oracle-vault','all','Alliances','189','en','["nonfoil","foil"]','{}','{"usd":"3.00","usd_foil":"9.00"}','1996-06-10','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z','uncommon',NULL,NULL);
INSERT INTO scryfall_printings VALUES('print-aether','oracle-aether','dst','Darksteel','91','en','["nonfoil"]','{}','{"usd":"20.00"}','2004-02-06','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z','uncommon',NULL,NULL);
CREATE TABLE IF NOT EXISTS "scryfall_syncs" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "status" TEXT NOT NULL, "bulk_type" TEXT NOT NULL, "bulk_uri" TEXT, "started_at" TEXT NOT NULL, "completed_at" TEXT, "cards_count" INTEGER DEFAULT 0 NOT NULL, "printings_count" INTEGER DEFAULT 0 NOT NULL, "error" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS "collection_items" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "scryfall_id" TEXT NOT NULL CONSTRAINT "collection_items_scryfall_id_fkey" REFERENCES "scryfall_printings"("scryfall_id") ON DELETE CASCADE, "quantity" INTEGER DEFAULT 1 NOT NULL, "condition" TEXT DEFAULT 'near_mint' NOT NULL, "language" TEXT DEFAULT 'en' NOT NULL, "finish" TEXT DEFAULT 'nonfoil' NOT NULL, "location" TEXT, "notes" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "location_id" INTEGER CONSTRAINT "collection_items_location_id_fkey" REFERENCES "locations"("id") ON DELETE SET NULL, "purchase_price_cents" INTEGER, "location_changed_at" TEXT);
INSERT INTO collection_items VALUES(1,'print-bolt',6,'near_mint','en','nonfoil',NULL,NULL,'2026-07-01T10:00:00Z','2026-07-01T10:00:00Z',2,50,'2026-07-01T10:00:00Z');
INSERT INTO collection_items VALUES(2,'print-counterspell',1,'near_mint','en','nonfoil',NULL,NULL,'2026-07-01T10:00:00Z','2026-07-02T10:00:00Z',NULL,NULL,'2026-07-02T10:00:00Z');
INSERT INTO collection_items VALUES(3,'print-krenko',1,'near_mint','en','nonfoil',NULL,NULL,'2026-07-01T10:00:00Z','2026-07-02T10:00:00Z',NULL,199,'2026-07-02T10:00:00Z');
INSERT INTO collection_items VALUES(4,'print-vault',2,'lightly_played','en','foil',NULL,'graded','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z',1,1234,'2026-07-01T10:00:00Z');
INSERT INTO collection_items VALUES(5,'print-aether',1,'near_mint','ja','nonfoil',NULL,NULL,'2026-07-01T10:00:00Z','2026-07-01T10:00:00Z',NULL,NULL,NULL);
CREATE TABLE IF NOT EXISTS "locations" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL, "kind" TEXT DEFAULT 'box' NOT NULL, "description" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "cover_scryfall_id" TEXT CONSTRAINT "locations_cover_scryfall_id_fkey" REFERENCES "scryfall_printings"("scryfall_id") ON DELETE SET NULL);
INSERT INTO locations VALUES(1,'Box A','box','Commons','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z',NULL);
INSERT INTO locations VALUES(2,'Trade Binder','binder',NULL,'2026-07-01T10:00:00Z','2026-07-01T10:00:00Z',NULL);
CREATE TABLE IF NOT EXISTS "decks" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL, "format" TEXT DEFAULT 'commander' NOT NULL, "status" TEXT DEFAULT 'brewing' NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "share_token" TEXT);
INSERT INTO decks VALUES(1,'Mono-Red Lotus','commander','active','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z','abcdefghijklmnopqrstuvwx');
INSERT INTO decks VALUES(2,'Spare Deck','commander','brewing','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z',NULL);
CREATE TABLE IF NOT EXISTS "deck_cards" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "deck_id" INTEGER NOT NULL CONSTRAINT "deck_cards_deck_id_fkey" REFERENCES "decks"("id") ON DELETE CASCADE, "oracle_id" TEXT NOT NULL CONSTRAINT "deck_cards_oracle_id_fkey" REFERENCES "scryfall_cards"("oracle_id") ON DELETE RESTRICT, "preferred_printing_id" TEXT CONSTRAINT "deck_cards_preferred_printing_id_fkey" REFERENCES "scryfall_printings"("scryfall_id") ON DELETE SET NULL, "quantity" INTEGER DEFAULT 1 NOT NULL, "zone" TEXT DEFAULT 'mainboard' NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "finish" TEXT DEFAULT 'nonfoil' NOT NULL, "proxy_quantity" INTEGER DEFAULT 0 NOT NULL, "tag" TEXT);
INSERT INTO deck_cards VALUES(1,1,'oracle-krenko','print-krenko',1,'commander','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z','nonfoil',0,NULL);
INSERT INTO deck_cards VALUES(2,1,'oracle-orphan',NULL,1,'mainboard','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z','nonfoil',0,NULL);
INSERT INTO deck_cards VALUES(3,1,'oracle-bolt',NULL,2,'sideboard','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z','nonfoil',1,'getting');
INSERT INTO deck_cards VALUES(4,1,'oracle-bolt','print-bolt',1,'maybeboard','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z','nonfoil',0,'consider_cutting');
INSERT INTO deck_cards VALUES(5,1,'oracle-counterspell',NULL,1,'sideboard','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z','nonfoil',0,NULL);
INSERT INTO deck_cards VALUES(6,1,'oracle-vault',NULL,1,'mainboard','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z','foil',0,NULL);
INSERT INTO deck_cards VALUES(7,2,'oracle-bolt',NULL,2,'sideboard','2026-07-01T10:00:00Z','2026-07-01T10:00:00Z','nonfoil',0,NULL);
CREATE TABLE IF NOT EXISTS "deck_allocations" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "deck_card_id" INTEGER NOT NULL CONSTRAINT "deck_allocations_deck_card_id_fkey" REFERENCES "deck_cards"("id") ON DELETE CASCADE, "collection_item_id" INTEGER NOT NULL CONSTRAINT "deck_allocations_collection_item_id_fkey" REFERENCES "collection_items"("id") ON DELETE CASCADE, "quantity" INTEGER DEFAULT 1 NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "source_location_id" INTEGER CONSTRAINT "deck_allocations_source_location_id_fkey" REFERENCES "locations"("id") ON DELETE SET NULL);
INSERT INTO deck_allocations VALUES(1,1,3,1,'2026-07-02T10:00:00Z','2026-07-02T10:00:00Z',1);
INSERT INTO deck_allocations VALUES(2,3,1,2,'2026-07-02T10:00:00Z','2026-07-02T10:00:00Z',2);
INSERT INTO deck_allocations VALUES(3,4,1,1,'2026-07-02T10:00:00Z','2026-07-02T10:00:00Z',2);
INSERT INTO deck_allocations VALUES(4,5,2,1,'2026-07-02T10:00:00Z','2026-07-02T10:00:00Z',1);
INSERT INTO deck_allocations VALUES(5,7,1,2,'2026-07-02T10:00:00Z','2026-07-02T10:00:00Z',2);
CREATE TABLE IF NOT EXISTS 'scryfall_printing_search_data'(id INTEGER PRIMARY KEY, block BLOB);
INSERT INTO scryfall_printing_search_data VALUES(1,x'');
INSERT INTO scryfall_printing_search_data VALUES(10,x'00000000000000');
CREATE TABLE IF NOT EXISTS 'scryfall_printing_search_idx'(segid, term, pgno, PRIMARY KEY(segid, term)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS 'scryfall_printing_search_content'(id INTEGER PRIMARY KEY, c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11);
CREATE TABLE IF NOT EXISTS 'scryfall_printing_search_docsize'(id INTEGER PRIMARY KEY, sz BLOB);
CREATE TABLE IF NOT EXISTS 'scryfall_printing_search_config'(k PRIMARY KEY, v) WITHOUT ROWID;
INSERT INTO scryfall_printing_search_config VALUES('version',4);
CREATE TABLE IF NOT EXISTS "backup_settings" ("id" INTEGER PRIMARY KEY, "enabled" INTEGER DEFAULT false NOT NULL, "provider" TEXT DEFAULT 'none' NOT NULL, "cron" TEXT DEFAULT '0 3 * * *' NOT NULL, "s3_endpoint" TEXT, "s3_bucket" TEXT, "s3_region" TEXT, "s3_prefix" TEXT, "s3_access_key_id" TEXT, "s3_secret_access_key" TEXT, "google_client_id" TEXT, "google_client_secret" TEXT, "google_refresh_token" TEXT, "google_folder_id" TEXT, "last_backup_at" TEXT, "last_backup_status" TEXT, "last_backup_message" TEXT, "last_backup_path" TEXT, "last_restore_at" TEXT, "last_restore_status" TEXT, "last_restore_message" TEXT, "pending_restore_path" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "retention_count" INTEGER);
INSERT INTO backup_settings VALUES(1,0,'s3','0 3 * * *','https://s3.example.test','mv','us-east-1',NULL,'AKIATEST','legacy-plaintext-secret',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-07-01T10:00:00Z','2026-07-01T10:00:00Z',7);
CREATE TABLE IF NOT EXISTS "auth_client_failures" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "client_id" TEXT NOT NULL, "failed_attempts" INTEGER DEFAULT 0 NOT NULL, "banned_at" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS "collection_auto_sort_rules" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL, "enabled" INTEGER DEFAULT true NOT NULL, "priority" INTEGER NOT NULL, "target_location_id" INTEGER NOT NULL CONSTRAINT "collection_auto_sort_rules_target_location_id_fkey" REFERENCES "locations"("id") ON DELETE CASCADE, "color_mode" TEXT DEFAULT 'any' NOT NULL, "colors" TEXT DEFAULT '[]' NOT NULL, "type_line_includes" TEXT DEFAULT '[]' NOT NULL, "type_line_excludes" TEXT DEFAULT '[]' NOT NULL, "rarities" TEXT DEFAULT '[]' NOT NULL, "min_price_cents" INTEGER, "max_price_cents" INTEGER, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "set_operator" TEXT DEFAULT 'in' NOT NULL, "set_codes" TEXT DEFAULT '[]' NOT NULL, "release_date_operator" TEXT DEFAULT 'after' NOT NULL, "release_date" TEXT);
CREATE TABLE IF NOT EXISTS "deck_tags" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "deck_id" INTEGER NOT NULL CONSTRAINT "deck_tags_deck_id_fkey" REFERENCES "decks"("id") ON DELETE CASCADE, "name" TEXT NOT NULL, "color" TEXT NOT NULL, "target_count" INTEGER, "position" INTEGER DEFAULT 0 NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);
INSERT INTO deck_tags VALUES(1,1,'Ramp','#22C55E',NULL,0,'2026-07-01T10:00:00Z','2026-07-01T10:00:00Z');
INSERT INTO deck_tags VALUES(2,1,'Draw','#3B82F6',NULL,1,'2026-07-01T10:00:00Z','2026-07-01T10:00:00Z');
INSERT INTO deck_tags VALUES(3,1,'Interact','#EF4444',NULL,2,'2026-07-01T10:00:00Z','2026-07-01T10:00:00Z');
INSERT INTO deck_tags VALUES(4,1,'Plan','#A855F7',NULL,3,'2026-07-01T10:00:00Z','2026-07-01T10:00:00Z');
CREATE TABLE IF NOT EXISTS "deck_card_tags" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "deck_card_id" INTEGER NOT NULL CONSTRAINT "deck_card_tags_deck_card_id_fkey" REFERENCES "deck_cards"("id") ON DELETE CASCADE, "deck_tag_id" INTEGER NOT NULL CONSTRAINT "deck_card_tags_deck_tag_id_fkey" REFERENCES "deck_tags"("id") ON DELETE CASCADE, "deck_id" INTEGER NOT NULL CONSTRAINT "deck_card_tags_deck_id_fkey" REFERENCES "decks"("id") ON DELETE CASCADE, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS "default_deck_tags" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL, "color" TEXT NOT NULL, "target_count" INTEGER, "position" INTEGER DEFAULT 0 NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);
INSERT INTO default_deck_tags VALUES(1,'Ramp','#22C55E',NULL,0,'2026-10-07T14:01:48','2026-10-07T14:01:48');
INSERT INTO default_deck_tags VALUES(2,'Draw','#3B82F6',NULL,1,'2026-10-07T14:01:48','2026-10-07T14:01:48');
INSERT INTO default_deck_tags VALUES(3,'Interact','#EF4444',NULL,2,'2026-10-07T14:01:48','2026-10-07T14:01:48');
INSERT INTO default_deck_tags VALUES(4,'Plan','#A855F7',NULL,3,'2026-10-07T14:01:48','2026-10-07T14:01:48');
PRAGMA writable_schema=ON;
INSERT INTO sqlite_schema(type,name,tbl_name,rootpage,sql)VALUES('table','scryfall_printing_search','scryfall_printing_search',0,'CREATE VIRTUAL TABLE scryfall_printing_search USING fts5(
  scryfall_id UNINDEXED,
  name,
  compact_name,
  flavor_name,
  compact_flavor_name,
  flavor_text,
  compact_flavor_text,
  type_line,
  oracle_text,
  compact_oracle_text,
  set_code,
  collector_number
)');
CREATE TABLE IF NOT EXISTS sqlite_sequence(name,seq);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence VALUES('default_deck_tags',4);
INSERT INTO sqlite_sequence VALUES('locations',2);
INSERT INTO sqlite_sequence VALUES('collection_items',5);
INSERT INTO sqlite_sequence VALUES('decks',2);
INSERT INTO sqlite_sequence VALUES('deck_tags',4);
INSERT INTO sqlite_sequence VALUES('deck_cards',7);
INSERT INTO sqlite_sequence VALUES('deck_allocations',5);
CREATE INDEX "scryfall_cards_name_index" ON "scryfall_cards" ("name");
CREATE INDEX "scryfall_cards_oracle_id_index" ON "scryfall_cards" ("oracle_id");
CREATE INDEX "scryfall_printings_oracle_id_index" ON "scryfall_printings" ("oracle_id");
CREATE INDEX "scryfall_printings_set_code_index" ON "scryfall_printings" ("set_code");
CREATE INDEX "scryfall_printings_collector_number_index" ON "scryfall_printings" ("collector_number");
CREATE INDEX "scryfall_printings_scryfall_id_index" ON "scryfall_printings" ("scryfall_id");
CREATE INDEX "scryfall_printings_set_code_collector_number_index" ON "scryfall_printings" ("set_code", "collector_number");
CREATE INDEX "scryfall_syncs_status_index" ON "scryfall_syncs" ("status");
CREATE INDEX "scryfall_syncs_bulk_type_index" ON "scryfall_syncs" ("bulk_type");
CREATE INDEX "scryfall_syncs_started_at_index" ON "scryfall_syncs" ("started_at");
CREATE INDEX "collection_items_scryfall_id_index" ON "collection_items" ("scryfall_id");
CREATE INDEX "collection_items_condition_index" ON "collection_items" ("condition");
CREATE INDEX "collection_items_language_index" ON "collection_items" ("language");
CREATE INDEX "collection_items_finish_index" ON "collection_items" ("finish");
CREATE UNIQUE INDEX "locations_name_index" ON "locations" ("name");
CREATE INDEX "collection_items_location_id_index" ON "collection_items" ("location_id");
CREATE INDEX "locations_cover_scryfall_id_index" ON "locations" ("cover_scryfall_id");
CREATE INDEX "decks_name_index" ON "decks" ("name");
CREATE INDEX "decks_format_index" ON "decks" ("format");
CREATE INDEX "decks_status_index" ON "decks" ("status");
CREATE INDEX "deck_cards_deck_id_index" ON "deck_cards" ("deck_id");
CREATE INDEX "deck_cards_oracle_id_index" ON "deck_cards" ("oracle_id");
CREATE INDEX "deck_cards_preferred_printing_id_index" ON "deck_cards" ("preferred_printing_id");
CREATE UNIQUE INDEX "deck_cards_deck_id_oracle_id_zone_index" ON "deck_cards" ("deck_id", "oracle_id", "zone");
CREATE INDEX scryfall_cards_name_nocase_idx
ON scryfall_cards(name COLLATE NOCASE)
;
CREATE INDEX "deck_allocations_deck_card_id_index" ON "deck_allocations" ("deck_card_id");
CREATE INDEX "deck_allocations_collection_item_id_index" ON "deck_allocations" ("collection_item_id");
CREATE UNIQUE INDEX "deck_allocations_deck_card_id_collection_item_id_index" ON "deck_allocations" ("deck_card_id", "collection_item_id");
CREATE INDEX "deck_allocations_source_location_id_index" ON "deck_allocations" ("source_location_id");
CREATE UNIQUE INDEX "decks_share_token_index" ON "decks" ("share_token");
CREATE INDEX "deck_cards_tag_index" ON "deck_cards" ("tag");
CREATE UNIQUE INDEX "auth_client_failures_client_id_index" ON "auth_client_failures" ("client_id");
CREATE INDEX "auth_client_failures_banned_at_index" ON "auth_client_failures" ("banned_at");
CREATE INDEX "scryfall_cards_deck_category_index" ON "scryfall_cards" ("deck_category");
CREATE INDEX scryfall_printings_oracle_release_set_collector_index
ON scryfall_printings (oracle_id, released_at DESC, set_code ASC, collector_number ASC)
;
CREATE INDEX "collection_items_scryfall_id_finish_index" ON "collection_items" ("scryfall_id", "finish");
CREATE INDEX "deck_cards_oracle_id_finish_index" ON "deck_cards" ("oracle_id", "finish");
CREATE INDEX "collection_auto_sort_rules_enabled_priority_index" ON "collection_auto_sort_rules" ("enabled", "priority");
CREATE INDEX "collection_auto_sort_rules_target_location_id_index" ON "collection_auto_sort_rules" ("target_location_id");
CREATE INDEX "collection_items_location_changed_at_index" ON "collection_items" ("location_changed_at");
CREATE INDEX "deck_tags_deck_id_index" ON "deck_tags" ("deck_id");
CREATE UNIQUE INDEX "deck_tags_deck_id_name_index" ON "deck_tags" ("deck_id", "name");
CREATE INDEX "deck_card_tags_deck_tag_id_index" ON "deck_card_tags" ("deck_tag_id");
CREATE UNIQUE INDEX "deck_card_tags_deck_card_id_deck_tag_id_index" ON "deck_card_tags" ("deck_card_id", "deck_tag_id");
CREATE UNIQUE INDEX "default_deck_tags_name_index" ON "default_deck_tags" ("name");
PRAGMA writable_schema=OFF;
COMMIT;
