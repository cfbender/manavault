-- Migration 20260808000001 (drop_case_insensitive_card_name_index).

DROP INDEX IF EXISTS scryfall_cards_name_nocase_idx;

