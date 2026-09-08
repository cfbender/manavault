defmodule Manavault.Repo.Migrations.AddSearchCoveringIndexes do
  use Ecto.Migration

  # Collection and catalog search join every matching printing and card. A
  # scryfall_printings row is ~2 KB (image_uris/prices JSON), so reading any
  # non-indexed printing column forces a random row fetch per match. These
  # covering indexes hold every column the search predicates, sorts, and price
  # fragments read, so the hot queries never touch the printing or card rows.
  # The json_extract expressions must match Manavault.Catalog.PriceFragments
  # exactly for SQLite to serve them from the index.
  #
  # The collection_items index puts the item scan in scryfall_id order so the
  # printing index probes are sequential rather than random.
  #
  # The dropped indexes are redundant: scryfall_id and oracle_id are TEXT
  # primary keys with their own autoindex, and the single-column oracle_id /
  # set_code printing indexes are prefixes of composite indexes.

  def change do
    execute(
      """
      CREATE INDEX scryfall_printings_search_covering_index
      ON scryfall_printings (scryfall_id, oracle_id, set_code, set_name, collector_number,
                             rarity, released_at, normalized_flavor_name,
                             json_extract(prices, '$.usd'),
                             json_extract(prices, '$.usd_foil'),
                             json_extract(prices, '$.usd_etched'))
      """,
      "DROP INDEX scryfall_printings_search_covering_index"
    )

    create index(
             :collection_items,
             [
               :scryfall_id,
               :location_id,
               :id,
               :quantity,
               :for_trade_quantity,
               :finish,
               :inserted_at,
               :purchase_price_cents,
               :condition,
               :language
             ],
             name: :collection_items_search_covering_index
           )

    execute(
      "DROP INDEX scryfall_printings_oracle_release_set_collector_index",
      """
      CREATE INDEX scryfall_printings_oracle_release_set_collector_index
      ON scryfall_printings (oracle_id, released_at DESC, set_code ASC, collector_number ASC)
      """
    )

    execute(
      """
      CREATE INDEX scryfall_printings_oracle_release_set_collector_index
      ON scryfall_printings (oracle_id, released_at DESC, set_code ASC, collector_number ASC,
                             normalized_flavor_name, set_name, scryfall_id, rarity, lang)
      """,
      "DROP INDEX scryfall_printings_oracle_release_set_collector_index"
    )

    execute(
      """
      CREATE INDEX scryfall_cards_search_covering_index
      ON scryfall_cards (oracle_id, name, normalized_name, type_line, colors, color_identity, cmc)
      """,
      "DROP INDEX scryfall_cards_search_covering_index"
    )

    drop index(:scryfall_printings, [:scryfall_id])
    drop index(:scryfall_printings, [:oracle_id])
    drop index(:scryfall_printings, [:set_code])
    drop index(:scryfall_cards, [:oracle_id])

    execute("ANALYZE", "ANALYZE")
  end
end
