-- Migration 20260617000003 (add_case_insensitive_card_name_index).

CREATE INDEX IF NOT EXISTS scryfall_cards_name_nocase_idx
ON scryfall_cards(name COLLATE NOCASE);

