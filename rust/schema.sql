CREATE TABLE "schema_migrations" ("version" INTEGER PRIMARY KEY, "inserted_at" TEXT);
CREATE TABLE "scryfall_cards" ("oracle_id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "type_line" TEXT, "oracle_text" TEXT, "color_identity" TEXT DEFAULT '[]' NOT NULL, "legalities" TEXT DEFAULT '{}' NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "mana_cost" TEXT, "cmc" NUMERIC, "colors" TEXT DEFAULT '[]' NOT NULL, "oracle_tags" TEXT DEFAULT '[]' NOT NULL, "deck_category" TEXT, "deck_themes" TEXT DEFAULT '[]' NOT NULL, "rulings_uri" TEXT, "game_changer" INTEGER DEFAULT false NOT NULL, "normalized_name" TEXT, "edhrec_rank" INTEGER, "edhrec_saltiness" NUMERIC, "edhrec_commander_rank" INTEGER, "layout" TEXT);
CREATE INDEX "scryfall_cards_name_index" ON "scryfall_cards" ("name");
CREATE TABLE "scryfall_printings" ("scryfall_id" TEXT PRIMARY KEY, "oracle_id" TEXT NOT NULL CONSTRAINT "scryfall_printings_oracle_id_fkey" REFERENCES "scryfall_cards"("oracle_id") ON DELETE CASCADE, "set_code" TEXT NOT NULL, "set_name" TEXT, "collector_number" TEXT NOT NULL, "lang" TEXT NOT NULL, "finishes" TEXT DEFAULT '[]' NOT NULL, "image_uris" TEXT DEFAULT '{}' NOT NULL, "prices" TEXT DEFAULT '{}' NOT NULL, "released_at" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "rarity" TEXT, "flavor_name" TEXT, "flavor_text" TEXT, "promo_types" TEXT DEFAULT '[]' NOT NULL, "normalized_flavor_name" TEXT, "illustration_id" TEXT, "promo" INTEGER DEFAULT false NOT NULL, "tcgplayer_id" INTEGER, "tcgplayer_etched_id" INTEGER);
CREATE INDEX "scryfall_printings_collector_number_index" ON "scryfall_printings" ("collector_number");
CREATE INDEX "scryfall_printings_set_code_collector_number_index" ON "scryfall_printings" ("set_code", "collector_number");
CREATE TABLE "scryfall_syncs" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "status" TEXT NOT NULL, "bulk_type" TEXT NOT NULL, "bulk_uri" TEXT, "started_at" TEXT NOT NULL, "completed_at" TEXT, "cards_count" INTEGER DEFAULT 0 NOT NULL, "printings_count" INTEGER DEFAULT 0 NOT NULL, "error" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);
CREATE TABLE sqlite_sequence(name,seq);
CREATE INDEX "scryfall_syncs_status_index" ON "scryfall_syncs" ("status");
CREATE INDEX "scryfall_syncs_bulk_type_index" ON "scryfall_syncs" ("bulk_type");
CREATE INDEX "scryfall_syncs_started_at_index" ON "scryfall_syncs" ("started_at");
CREATE TABLE "collection_items" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "scryfall_id" TEXT NOT NULL CONSTRAINT "collection_items_scryfall_id_fkey" REFERENCES "scryfall_printings"("scryfall_id") ON DELETE CASCADE, "quantity" INTEGER DEFAULT 1 NOT NULL, "condition" TEXT DEFAULT 'near_mint' NOT NULL, "language" TEXT DEFAULT 'en' NOT NULL, "finish" TEXT DEFAULT 'nonfoil' NOT NULL, "location" TEXT, "notes" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "location_id" INTEGER CONSTRAINT "collection_items_location_id_fkey" REFERENCES "locations"("id") ON DELETE SET NULL, "purchase_price_cents" INTEGER, "location_changed_at" TEXT, "for_trade" INTEGER DEFAULT false NOT NULL, "for_trade_quantity" INTEGER DEFAULT 0 NOT NULL);
CREATE INDEX "collection_items_scryfall_id_index" ON "collection_items" ("scryfall_id");
CREATE INDEX "collection_items_condition_index" ON "collection_items" ("condition");
CREATE INDEX "collection_items_language_index" ON "collection_items" ("language");
CREATE INDEX "collection_items_finish_index" ON "collection_items" ("finish");
CREATE TABLE "locations" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL, "kind" TEXT DEFAULT 'box' NOT NULL, "description" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "cover_scryfall_id" TEXT CONSTRAINT "locations_cover_scryfall_id_fkey" REFERENCES "scryfall_printings"("scryfall_id") ON DELETE SET NULL);
CREATE UNIQUE INDEX "locations_name_index" ON "locations" ("name");
CREATE INDEX "collection_items_location_id_index" ON "collection_items" ("location_id");
CREATE INDEX "locations_cover_scryfall_id_index" ON "locations" ("cover_scryfall_id");
CREATE TABLE "decks" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL, "format" TEXT DEFAULT 'commander' NOT NULL, "status" TEXT DEFAULT 'brewing' NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "share_token" TEXT, "cover_deck_card_id" INTEGER CONSTRAINT "decks_cover_deck_card_id_fkey" REFERENCES "deck_cards"("id") ON DELETE SET NULL, "primer" TEXT, "ai_analysis" TEXT, "ai_analysis_model" TEXT, "ai_analyzed_at" TEXT, "commander_bracket" INTEGER, "commander_bracket_estimate" INTEGER, "play_count" INTEGER DEFAULT 0 NOT NULL, "skip_count" INTEGER DEFAULT 0 NOT NULL, "last_played_at" TEXT, "included_for_play" INTEGER DEFAULT true NOT NULL, "commander_bracket_rating" TEXT, "external_source" TEXT, "external_id" TEXT, "external_url" TEXT, "external_synced_at" TEXT, "external_sync_error" TEXT);
CREATE INDEX "decks_name_index" ON "decks" ("name");
CREATE INDEX "decks_format_index" ON "decks" ("format");
CREATE INDEX "decks_status_index" ON "decks" ("status");
CREATE TABLE "deck_cards" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "deck_id" INTEGER NOT NULL CONSTRAINT "deck_cards_deck_id_fkey" REFERENCES "decks"("id") ON DELETE CASCADE, "oracle_id" TEXT NOT NULL CONSTRAINT "deck_cards_oracle_id_fkey" REFERENCES "scryfall_cards"("oracle_id") ON DELETE RESTRICT, "preferred_printing_id" TEXT CONSTRAINT "deck_cards_preferred_printing_id_fkey" REFERENCES "scryfall_printings"("scryfall_id") ON DELETE SET NULL, "quantity" INTEGER DEFAULT 1 NOT NULL, "zone" TEXT DEFAULT 'mainboard' NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "finish" TEXT DEFAULT 'nonfoil' NOT NULL, "proxy_quantity" INTEGER DEFAULT 0 NOT NULL, "tag" TEXT);
CREATE INDEX "deck_cards_deck_id_index" ON "deck_cards" ("deck_id");
CREATE INDEX "deck_cards_oracle_id_index" ON "deck_cards" ("oracle_id");
CREATE INDEX "deck_cards_preferred_printing_id_index" ON "deck_cards" ("preferred_printing_id");
CREATE UNIQUE INDEX "deck_cards_deck_id_oracle_id_zone_index" ON "deck_cards" ("deck_id", "oracle_id", "zone");
CREATE TABLE "deck_allocations" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "deck_card_id" INTEGER NOT NULL CONSTRAINT "deck_allocations_deck_card_id_fkey" REFERENCES "deck_cards"("id") ON DELETE CASCADE, "collection_item_id" INTEGER NOT NULL CONSTRAINT "deck_allocations_collection_item_id_fkey" REFERENCES "collection_items"("id") ON DELETE CASCADE, "quantity" INTEGER DEFAULT 1 NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "source_location_id" INTEGER CONSTRAINT "deck_allocations_source_location_id_fkey" REFERENCES "locations"("id") ON DELETE SET NULL);
CREATE INDEX "deck_allocations_deck_card_id_index" ON "deck_allocations" ("deck_card_id");
CREATE INDEX "deck_allocations_collection_item_id_index" ON "deck_allocations" ("collection_item_id");
CREATE UNIQUE INDEX "deck_allocations_deck_card_id_collection_item_id_index" ON "deck_allocations" ("deck_card_id", "collection_item_id");
CREATE INDEX "deck_allocations_source_location_id_index" ON "deck_allocations" ("source_location_id");
CREATE UNIQUE INDEX "decks_share_token_index" ON "decks" ("share_token");
CREATE TABLE "backup_settings" ("id" INTEGER PRIMARY KEY, "enabled" INTEGER DEFAULT false NOT NULL, "provider" TEXT DEFAULT 'none' NOT NULL, "cron" TEXT DEFAULT '0 3 * * *' NOT NULL, "s3_endpoint" TEXT, "s3_bucket" TEXT, "s3_region" TEXT, "s3_prefix" TEXT, "s3_access_key_id" TEXT, "s3_secret_access_key" TEXT, "google_client_id" TEXT, "google_client_secret" TEXT, "google_refresh_token" TEXT, "google_folder_id" TEXT, "last_backup_at" TEXT, "last_backup_status" TEXT, "last_backup_message" TEXT, "last_backup_path" TEXT, "last_restore_at" TEXT, "last_restore_status" TEXT, "last_restore_message" TEXT, "pending_restore_path" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "retention_count" INTEGER);
CREATE INDEX "deck_cards_tag_index" ON "deck_cards" ("tag");
CREATE TABLE "auth_client_failures" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "client_id" TEXT NOT NULL, "failed_attempts" INTEGER DEFAULT 0 NOT NULL, "banned_at" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);
CREATE UNIQUE INDEX "auth_client_failures_client_id_index" ON "auth_client_failures" ("client_id");
CREATE INDEX "auth_client_failures_banned_at_index" ON "auth_client_failures" ("banned_at");
CREATE INDEX "scryfall_cards_deck_category_index" ON "scryfall_cards" ("deck_category");
CREATE INDEX "collection_items_scryfall_id_finish_index" ON "collection_items" ("scryfall_id", "finish");
CREATE INDEX "deck_cards_oracle_id_finish_index" ON "deck_cards" ("oracle_id", "finish");
CREATE TABLE "collection_auto_sort_rules" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL, "enabled" INTEGER DEFAULT true NOT NULL, "priority" INTEGER NOT NULL, "target_location_id" INTEGER NOT NULL CONSTRAINT "collection_auto_sort_rules_target_location_id_fkey" REFERENCES "locations"("id") ON DELETE CASCADE, "color_mode" TEXT DEFAULT 'any' NOT NULL, "colors" TEXT DEFAULT '[]' NOT NULL, "type_line_includes" TEXT DEFAULT '[]' NOT NULL, "type_line_excludes" TEXT DEFAULT '[]' NOT NULL, "rarities" TEXT DEFAULT '[]' NOT NULL, "min_price_cents" INTEGER, "max_price_cents" INTEGER, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "set_operator" TEXT DEFAULT 'in' NOT NULL, "set_codes" TEXT DEFAULT '[]' NOT NULL, "release_date_operator" TEXT DEFAULT 'after' NOT NULL, "release_date" TEXT);
CREATE INDEX "collection_auto_sort_rules_enabled_priority_index" ON "collection_auto_sort_rules" ("enabled", "priority");
CREATE INDEX "collection_auto_sort_rules_target_location_id_index" ON "collection_auto_sort_rules" ("target_location_id");
CREATE INDEX "collection_items_location_changed_at_index" ON "collection_items" ("location_changed_at");
CREATE TABLE "deck_tags" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "deck_id" INTEGER NOT NULL CONSTRAINT "deck_tags_deck_id_fkey" REFERENCES "decks"("id") ON DELETE CASCADE, "name" TEXT NOT NULL, "color" TEXT NOT NULL, "target_count" INTEGER, "position" INTEGER DEFAULT 0 NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);
CREATE INDEX "deck_tags_deck_id_index" ON "deck_tags" ("deck_id");
CREATE UNIQUE INDEX "deck_tags_deck_id_name_index" ON "deck_tags" ("deck_id", "name");
CREATE TABLE "deck_card_tags" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "deck_card_id" INTEGER NOT NULL CONSTRAINT "deck_card_tags_deck_card_id_fkey" REFERENCES "deck_cards"("id") ON DELETE CASCADE, "deck_tag_id" INTEGER NOT NULL CONSTRAINT "deck_card_tags_deck_tag_id_fkey" REFERENCES "deck_tags"("id") ON DELETE CASCADE, "deck_id" INTEGER NOT NULL CONSTRAINT "deck_card_tags_deck_id_fkey" REFERENCES "decks"("id") ON DELETE CASCADE, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);
CREATE INDEX "deck_card_tags_deck_tag_id_index" ON "deck_card_tags" ("deck_tag_id");
CREATE UNIQUE INDEX "deck_card_tags_deck_card_id_deck_tag_id_index" ON "deck_card_tags" ("deck_card_id", "deck_tag_id");
CREATE TABLE "default_deck_tags" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL, "color" TEXT NOT NULL, "target_count" INTEGER, "position" INTEGER DEFAULT 0 NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);
CREATE UNIQUE INDEX "default_deck_tags_name_index" ON "default_deck_tags" ("name");
CREATE INDEX "collection_items_for_trade_index" ON "collection_items" ("for_trade");
CREATE TABLE "trade_wants" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "oracle_id" TEXT NOT NULL CONSTRAINT "trade_wants_oracle_id_fkey" REFERENCES "scryfall_cards"("oracle_id") ON DELETE CASCADE, "quantity" INTEGER DEFAULT 1 NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "preferred_printing_id" TEXT CONSTRAINT "trade_wants_preferred_printing_id_fkey" REFERENCES "scryfall_printings"("scryfall_id") ON DELETE SET NULL);
CREATE INDEX "trade_wants_preferred_printing_id_index" ON "trade_wants" ("preferred_printing_id");
CREATE UNIQUE INDEX "trade_wants_oracle_id_generic_index" ON "trade_wants" ("oracle_id") WHERE preferred_printing_id IS NULL;
CREATE UNIQUE INDEX "trade_wants_oracle_id_preferred_printing_id_index" ON "trade_wants" ("oracle_id", "preferred_printing_id") WHERE preferred_printing_id IS NOT NULL;
CREATE TABLE "trade_want_shares" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "token" TEXT NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);
CREATE UNIQUE INDEX "trade_want_shares_token_index" ON "trade_want_shares" ("token");
CREATE TABLE "trade_binder_shares" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "token" TEXT NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);
CREATE UNIQUE INDEX "trade_binder_shares_token_index" ON "trade_binder_shares" ("token");
CREATE INDEX "scryfall_cards_normalized_name_index" ON "scryfall_cards" ("normalized_name");
CREATE TABLE "vendor_prices" ("vendor" TEXT, "scryfall_id" TEXT, "finish" TEXT, "price_cents" INTEGER NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, PRIMARY KEY ("vendor","scryfall_id","finish"));
CREATE INDEX "vendor_prices_scryfall_id_index" ON "vendor_prices" ("scryfall_id");
CREATE INDEX "vendor_prices_vendor_updated_at_index" ON "vendor_prices" ("vendor", "updated_at");
CREATE TABLE "pricing_settings" ("id" INTEGER PRIMARY KEY, "source" TEXT DEFAULT 'scryfall' NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);
CREATE INDEX "decks_cover_deck_card_id_index" ON "decks" ("cover_deck_card_id");
CREATE INDEX "scryfall_printings_normalized_flavor_name_index" ON "scryfall_printings" ("normalized_flavor_name");
CREATE TABLE "ai_settings" ("id" INTEGER PRIMARY KEY, "provider" TEXT DEFAULT 'openrouter' NOT NULL, "api_key" TEXT, "model" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "deck_analysis_instructions" TEXT);
CREATE TABLE "deck_question_answers" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "deck_id" INTEGER NOT NULL CONSTRAINT "deck_question_answers_deck_id_fkey" REFERENCES "decks"("id") ON DELETE CASCADE, "question" TEXT NOT NULL, "answer" TEXT NOT NULL, "inserted_at" TEXT NOT NULL, "recommendations" TEXT, "status" TEXT DEFAULT 'completed' NOT NULL, "error" TEXT, "model" TEXT, "thread_id" TEXT, "swap_context" TEXT, "conversation_id" TEXT);
CREATE INDEX "deck_question_answers_deck_id_inserted_at_index" ON "deck_question_answers" ("deck_id", "inserted_at");
CREATE TABLE "deck_analysis_requests" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "source_type" TEXT NOT NULL, "source" TEXT NOT NULL, "source_name" TEXT NOT NULL, "format" TEXT NOT NULL, "analysis" TEXT NOT NULL, "model" TEXT NOT NULL, "commander_bracket" INTEGER, "commander_bracket_estimate" INTEGER, "inserted_at" TEXT NOT NULL, "commander_bracket_rating" TEXT);
CREATE INDEX "deck_analysis_requests_inserted_at_index" ON "deck_analysis_requests" ("inserted_at");
CREATE INDEX scryfall_printings_search_covering_index
ON scryfall_printings (scryfall_id, oracle_id, set_code, set_name, collector_number,
                       rarity, released_at, normalized_flavor_name,
                       json_extract(prices, '$.usd'),
                       json_extract(prices, '$.usd_foil'),
                       json_extract(prices, '$.usd_etched'));
CREATE INDEX "collection_items_search_covering_index" ON "collection_items" ("scryfall_id", "location_id", "id", "quantity", "for_trade_quantity", "finish", "inserted_at", "purchase_price_cents", "condition", "language");
CREATE INDEX scryfall_printings_oracle_release_set_collector_index
ON scryfall_printings (oracle_id, released_at DESC, set_code ASC, collector_number ASC,
                       normalized_flavor_name, set_name, scryfall_id, rarity, lang);
CREATE INDEX scryfall_cards_search_covering_index
ON scryfall_cards (oracle_id, name, normalized_name, type_line, colors, color_identity, cmc);
CREATE TABLE "api_keys" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL, "prefix" TEXT NOT NULL, "token_hash" BLOB NOT NULL, "last_used_at" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);
CREATE UNIQUE INDEX "api_keys_token_hash_index" ON "api_keys" ("token_hash");
CREATE INDEX "api_keys_prefix_index" ON "api_keys" ("prefix");
CREATE TABLE "appearance_settings" ("id" INTEGER PRIMARY KEY, "palette" TEXT DEFAULT 'claret' NOT NULL, "theme_style" TEXT DEFAULT 'glass' NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);
CREATE INDEX "deck_question_answers_deck_id_thread_id_index" ON "deck_question_answers" ("deck_id", "thread_id");
CREATE INDEX "scryfall_printings_illustration_id_index" ON "scryfall_printings" ("illustration_id");
CREATE INDEX "deck_question_answers_deck_id_conversation_id_index" ON "deck_question_answers" ("deck_id", "conversation_id");
CREATE INDEX "decks_external_source_index" ON "decks" ("external_source");
CREATE INDEX "scryfall_cards_layout_index" ON "scryfall_cards" ("layout");
CREATE TABLE "scryfall_card_tokens" ("scryfall_id" TEXT NOT NULL, "token_scryfall_id" TEXT NOT NULL);
CREATE UNIQUE INDEX "scryfall_card_tokens_scryfall_id_token_scryfall_id_index" ON "scryfall_card_tokens" ("scryfall_id", "token_scryfall_id");
CREATE INDEX "scryfall_card_tokens_token_scryfall_id_index" ON "scryfall_card_tokens" ("token_scryfall_id");
CREATE TABLE "token_items" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "scryfall_id" TEXT NOT NULL CONSTRAINT "token_items_scryfall_id_fkey" REFERENCES "scryfall_printings"("scryfall_id") ON DELETE CASCADE, "back_scryfall_id" TEXT CONSTRAINT "token_items_back_scryfall_id_fkey" REFERENCES "scryfall_printings"("scryfall_id") ON DELETE SET NULL, "quantity" INTEGER DEFAULT 1 NOT NULL, "finish" TEXT DEFAULT 'nonfoil' NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);
CREATE INDEX "token_items_scryfall_id_index" ON "token_items" ("scryfall_id");
CREATE INDEX "token_items_back_scryfall_id_index" ON "token_items" ("back_scryfall_id");
CREATE TABLE "jobs" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "worker" TEXT NOT NULL,
  "queue" TEXT NOT NULL,
  "args" TEXT NOT NULL DEFAULT '{}',
  "state" TEXT NOT NULL DEFAULT 'queued'
    CHECK ("state" IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL,
  "run_at" TEXT NOT NULL,
  "started_at" TEXT,
  "finished_at" TEXT,
  "last_error" TEXT,
  "inserted_at" TEXT NOT NULL
);
CREATE INDEX "jobs_queue_state_run_at_index" ON "jobs" ("queue", "state", "run_at", "id");
CREATE INDEX "jobs_worker_index" ON "jobs" ("worker", "id");
INSERT INTO schema_migrations VALUES(20260101000000,NULL);
INSERT INTO schema_migrations VALUES(20260102000000,NULL);
INSERT INTO schema_migrations VALUES(20260103000000,NULL);
INSERT INTO schema_migrations VALUES(20260103000001,NULL);
INSERT INTO schema_migrations VALUES(20260105000000,NULL);
INSERT INTO schema_migrations VALUES(20260616000000,NULL);
INSERT INTO schema_migrations VALUES(20260617000000,NULL);
INSERT INTO schema_migrations VALUES(20260617000001,NULL);
INSERT INTO schema_migrations VALUES(20260617000002,NULL);
INSERT INTO schema_migrations VALUES(20260617000003,NULL);
INSERT INTO schema_migrations VALUES(20260617000004,NULL);
INSERT INTO schema_migrations VALUES(20260617000005,NULL);
INSERT INTO schema_migrations VALUES(20260620000000,NULL);
INSERT INTO schema_migrations VALUES(20260620000001,NULL);
INSERT INTO schema_migrations VALUES(20260620000002,NULL);
INSERT INTO schema_migrations VALUES(20260621000000,NULL);
INSERT INTO schema_migrations VALUES(20260621000001,NULL);
INSERT INTO schema_migrations VALUES(20260622000000,NULL);
INSERT INTO schema_migrations VALUES(20260622000001,NULL);
INSERT INTO schema_migrations VALUES(20260622000002,NULL);
INSERT INTO schema_migrations VALUES(20260622000003,NULL);
INSERT INTO schema_migrations VALUES(20260623000000,NULL);
INSERT INTO schema_migrations VALUES(20260623000001,NULL);
INSERT INTO schema_migrations VALUES(20260624000000,NULL);
INSERT INTO schema_migrations VALUES(20260625000000,NULL);
INSERT INTO schema_migrations VALUES(20260625000001,NULL);
INSERT INTO schema_migrations VALUES(20260625000002,NULL);
INSERT INTO schema_migrations VALUES(20260627000000,NULL);
INSERT INTO schema_migrations VALUES(20260703000000,NULL);
INSERT INTO schema_migrations VALUES(20260703000001,NULL);
INSERT INTO schema_migrations VALUES(20260708000000,NULL);
INSERT INTO schema_migrations VALUES(20260708000001,NULL);
INSERT INTO schema_migrations VALUES(20260708000002,NULL);
INSERT INTO schema_migrations VALUES(20260708000003,NULL);
INSERT INTO schema_migrations VALUES(20260802000000,NULL);
INSERT INTO schema_migrations VALUES(20260802000001,NULL);
INSERT INTO schema_migrations VALUES(20260802100000,NULL);
INSERT INTO schema_migrations VALUES(20260802100001,NULL);
INSERT INTO schema_migrations VALUES(20260802120000,NULL);
INSERT INTO schema_migrations VALUES(20260802130000,NULL);
INSERT INTO schema_migrations VALUES(20260804000000,NULL);
INSERT INTO schema_migrations VALUES(20260808000000,NULL);
INSERT INTO schema_migrations VALUES(20260808000001,NULL);
INSERT INTO schema_migrations VALUES(20260808000002,NULL);
INSERT INTO schema_migrations VALUES(20260809000000,NULL);
INSERT INTO schema_migrations VALUES(20260810120000,NULL);
INSERT INTO schema_migrations VALUES(20260810130000,NULL);
INSERT INTO schema_migrations VALUES(20260811180000,NULL);
INSERT INTO schema_migrations VALUES(20260812160000,NULL);
INSERT INTO schema_migrations VALUES(20260813000000,NULL);
INSERT INTO schema_migrations VALUES(20260813000001,NULL);
INSERT INTO schema_migrations VALUES(20260815000000,NULL);
INSERT INTO schema_migrations VALUES(20260819000000,NULL);
INSERT INTO schema_migrations VALUES(20260819032430,NULL);
INSERT INTO schema_migrations VALUES(20260819043000,NULL);
INSERT INTO schema_migrations VALUES(20260819212626,NULL);
INSERT INTO schema_migrations VALUES(20260822170000,NULL);
INSERT INTO schema_migrations VALUES(20260822170100,NULL);
INSERT INTO schema_migrations VALUES(20260824000000,NULL);
INSERT INTO schema_migrations VALUES(20260826000000,NULL);
INSERT INTO schema_migrations VALUES(20260830000000,NULL);
INSERT INTO schema_migrations VALUES(20260908000000,NULL);
INSERT INTO schema_migrations VALUES(20260908000001,NULL);
INSERT INTO schema_migrations VALUES(20260914231500,NULL);
INSERT INTO schema_migrations VALUES(20260920000000,NULL);
INSERT INTO schema_migrations VALUES(20260924000000,NULL);
INSERT INTO schema_migrations VALUES(20260927120000,NULL);
INSERT INTO schema_migrations VALUES(20260928000000,NULL);
INSERT INTO schema_migrations VALUES(20260930000000,NULL);
INSERT INTO schema_migrations VALUES(20260930210000,NULL);
INSERT INTO schema_migrations VALUES(20261004000000,NULL);
INSERT INTO schema_migrations VALUES(20261005000000,NULL);
INSERT INTO schema_migrations VALUES(20261006000000,NULL);
INSERT INTO schema_migrations VALUES(20261006120000,NULL);
INSERT INTO schema_migrations VALUES(20261007201043,NULL);
