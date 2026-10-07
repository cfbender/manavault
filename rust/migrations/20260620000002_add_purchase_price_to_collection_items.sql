-- Migration 20260620000002 (add_purchase_price_to_collection_items).

ALTER TABLE "collection_items" ADD COLUMN "purchase_price_cents" INTEGER;

UPDATE collection_items
SET purchase_price_cents = (
  SELECT CAST(ROUND(CAST(NULLIF(
    CASE collection_items.finish
      WHEN 'foil' THEN COALESCE(json_extract(scryfall_printings.prices, '$.usd_foil'), json_extract(scryfall_printings.prices, '$.usd'))
      WHEN 'etched' THEN COALESCE(json_extract(scryfall_printings.prices, '$.usd_etched'), json_extract(scryfall_printings.prices, '$.usd_foil'), json_extract(scryfall_printings.prices, '$.usd'))
      ELSE COALESCE(json_extract(scryfall_printings.prices, '$.usd'), json_extract(scryfall_printings.prices, '$.usd_foil'), json_extract(scryfall_printings.prices, '$.usd_etched'))
    END,
    ''
  ) AS REAL) * 100) AS INTEGER)
  FROM scryfall_printings
  WHERE scryfall_printings.scryfall_id = collection_items.scryfall_id
)
WHERE purchase_price_cents IS NULL
  AND EXISTS (
    SELECT 1
    FROM scryfall_printings
    WHERE scryfall_printings.scryfall_id = collection_items.scryfall_id
  );

