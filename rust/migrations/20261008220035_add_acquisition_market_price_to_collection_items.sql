-- Migration 20261008220035 (add_acquisition_market_price_to_collection_items).
--
-- The selected price source's market price of one copy when the item entered
-- the collection. Existing items take today's price: the active vendor's
-- price along the finish fallback chain, else Scryfall's; items without a
-- price stay NULL and count at their current price.

ALTER TABLE "collection_items" ADD COLUMN "acquisition_market_price_cents" INTEGER;

UPDATE collection_items
SET acquisition_market_price_cents = CASE collection_items.finish
  WHEN 'foil' THEN COALESCE(
    (SELECT vendor_price.price_cents FROM vendor_prices AS vendor_price
     WHERE vendor_price.vendor = (SELECT source FROM pricing_settings WHERE id = 1)
       AND vendor_price.scryfall_id = collection_items.scryfall_id
       AND vendor_price.finish IN ('foil', 'nonfoil')
     ORDER BY CASE vendor_price.finish WHEN 'foil' THEN 1 WHEN 'nonfoil' THEN 2 ELSE 3 END
     LIMIT 1),
    (SELECT CAST(ROUND(CAST(NULLIF(COALESCE(
       json_extract(p.prices, '$.usd_foil'), json_extract(p.prices, '$.usd')), '') AS REAL) * 100) AS INTEGER)
     FROM scryfall_printings AS p WHERE p.scryfall_id = collection_items.scryfall_id))
  WHEN 'etched' THEN COALESCE(
    (SELECT vendor_price.price_cents FROM vendor_prices AS vendor_price
     WHERE vendor_price.vendor = (SELECT source FROM pricing_settings WHERE id = 1)
       AND vendor_price.scryfall_id = collection_items.scryfall_id
       AND vendor_price.finish IN ('etched', 'foil', 'nonfoil')
     ORDER BY CASE vendor_price.finish WHEN 'etched' THEN 1 WHEN 'foil' THEN 2 WHEN 'nonfoil' THEN 3 ELSE 4 END
     LIMIT 1),
    (SELECT CAST(ROUND(CAST(NULLIF(COALESCE(
       json_extract(p.prices, '$.usd_etched'), json_extract(p.prices, '$.usd_foil'), json_extract(p.prices, '$.usd')), '') AS REAL) * 100) AS INTEGER)
     FROM scryfall_printings AS p WHERE p.scryfall_id = collection_items.scryfall_id))
  ELSE COALESCE(
    (SELECT vendor_price.price_cents FROM vendor_prices AS vendor_price
     WHERE vendor_price.vendor = (SELECT source FROM pricing_settings WHERE id = 1)
       AND vendor_price.scryfall_id = collection_items.scryfall_id
       AND vendor_price.finish IN ('nonfoil', 'foil', 'etched')
     ORDER BY CASE vendor_price.finish WHEN 'nonfoil' THEN 1 WHEN 'foil' THEN 2 WHEN 'etched' THEN 3 ELSE 4 END
     LIMIT 1),
    (SELECT CAST(ROUND(CAST(NULLIF(COALESCE(
       json_extract(p.prices, '$.usd'), json_extract(p.prices, '$.usd_foil'), json_extract(p.prices, '$.usd_etched')), '') AS REAL) * 100) AS INTEGER)
     FROM scryfall_printings AS p WHERE p.scryfall_id = collection_items.scryfall_id))
END
WHERE acquisition_market_price_cents IS NULL;
