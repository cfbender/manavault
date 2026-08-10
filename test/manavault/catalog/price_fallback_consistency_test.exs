defmodule Manavault.Catalog.PriceFallbackConsistencyTest do
  use Manavault.DataCase

  import Ecto.Query

  import Manavault.Catalog.PriceFragments,
    only: [price_cents_fragment: 2, price_value_fragment: 2]

  alias Manavault.Catalog
  alias Manavault.Catalog.{CollectionItem, Price, Printing}
  alias Manavault.Pricing
  alias Manavault.Pricing.{Store, Sync}
  alias Manavault.Repo

  @finishes ~w(nonfoil foil etched)

  @prices_variants [
    %{"usd" => "1.00", "usd_foil" => "2.00", "usd_etched" => "3.00"},
    %{"usd" => "1.00", "usd_foil" => "2.00"},
    %{"usd_foil" => "2.00"},
    %{"usd_etched" => "3.00"},
    %{"usd" => "1.00"},
    %{}
  ]

  test "SQL price fragment agrees with in-memory finish fallback for every finish" do
    cards =
      @prices_variants
      |> Enum.with_index(1)
      |> Enum.map(fn {prices, index} ->
        %{
          "id" => "scryfall-printing-price-#{index}",
          "oracle_id" => "oracle-price-#{index}",
          "name" => "Price Probe #{index}",
          "type_line" => "Artifact",
          "cmc" => 0.0,
          "colors" => [],
          "color_identity" => [],
          "set" => "tst",
          "set_name" => "Test Set",
          "collector_number" => "#{index}",
          "lang" => "en",
          "rarity" => "rare",
          "finishes" => @finishes,
          "prices" => prices,
          "released_at" => "2026-01-01"
        }
      end)

    assert {:ok, _} = Catalog.import_cards(cards)

    for printing <- Repo.all(Printing), finish <- @finishes do
      assert {:ok, item} =
               Catalog.create_collection_item(%{
                 "scryfall_id" => printing.scryfall_id,
                 "finish" => finish,
                 "quantity" => 1
               })

      sql_cents =
        CollectionItem
        |> where([item], item.id == ^item.id)
        |> join(:inner, [item], printing in assoc(item, :printing))
        |> select([item, printing], price_cents_fragment(item, printing))
        |> Repo.one()

      in_memory_cents = Price.price_cents_for_printing(printing, finish) || 0

      assert sql_cents == in_memory_cents,
             "finish #{finish} with prices #{printing.prices}: " <>
               "SQL #{inspect(sql_cents)} != in-memory #{inspect(in_memory_cents)}"
    end
  end

  test "collection price filters use the selected vendor's current price, not price paid" do
    card = %{
      "id" => "scryfall-market-filter",
      "oracle_id" => "oracle-market-filter",
      "name" => "Market Filter Probe",
      "type_line" => "Artifact",
      "cmc" => 0.0,
      "colors" => [],
      "color_identity" => [],
      "set" => "tst",
      "set_name" => "Test Set",
      "collector_number" => "100",
      "lang" => "en",
      "rarity" => "rare",
      "finishes" => @finishes,
      "prices" => %{"usd" => "1.00", "usd_foil" => "2.00", "usd_etched" => "3.00"},
      "released_at" => "2026-01-01"
    }

    assert {:ok, _} = Catalog.import_cards([card])

    for finish <- @finishes do
      assert {:ok, _item} =
               Catalog.create_collection_item(%{
                 "scryfall_id" => card["id"],
                 "finish" => finish,
                 "quantity" => 1,
                 "purchase_price_cents" => 10_000
               })
    end

    assert %{upserted: 2} =
             Sync.replace_vendor_prices("tcgplayer", [
               %{scryfall_id: card["id"], finish: "nonfoil", price_cents: 1_000},
               %{scryfall_id: card["id"], finish: "foil", price_cents: 2_000}
             ])

    assert {:ok, %{source: "tcgplayer"}} = Pricing.set_source("tcgplayer")
    start_supervised!(Store)

    assert ["etched", "foil"] == collection_item_finishes("usd>=15")
    assert ["nonfoil"] == collection_item_finishes("usd<15")
  end

  test "collection price sorting uses the selected vendor's current price" do
    lower_market = market_sort_card("lower-market", "Lower Market", "30.00")
    higher_market = market_sort_card("higher-market", "Higher Market", "1.00")

    assert {:ok, _} = Catalog.import_cards([lower_market, higher_market])

    assert {:ok, _item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => lower_market["id"],
               "quantity" => 1,
               "purchase_price_cents" => 4_000
             })

    assert {:ok, _item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => higher_market["id"],
               "quantity" => 1,
               "purchase_price_cents" => 500
             })

    assert %{upserted: 2} =
             Sync.replace_vendor_prices("tcgplayer", [
               %{scryfall_id: lower_market["id"], finish: "nonfoil", price_cents: 1_000},
               %{scryfall_id: higher_market["id"], finish: "nonfoil", price_cents: 2_000}
             ])

    assert {:ok, %{source: "tcgplayer"}} = Pricing.set_source("tcgplayer")
    start_supervised!(Store)

    assert ["Lower Market", "Higher Market"] == sorted_group_names("asc")
    assert ["Higher Market", "Lower Market"] == sorted_group_names("desc")
  end

  defp collection_item_finishes(query) do
    [q: query]
    |> Catalog.list_collection_items(limit: 10)
    |> Enum.map(& &1.finish)
    |> Enum.sort()
  end

  defp sorted_group_names(direction) do
    []
    |> Catalog.list_collection_item_groups(
      limit: 10,
      sort: %{field: "price", direction: direction}
    )
    |> Enum.map(fn %{items: [item | _]} -> item.printing.card.name end)
  end

  defp market_sort_card(slug, name, scryfall_price) do
    %{
      "id" => "scryfall-#{slug}",
      "oracle_id" => "oracle-#{slug}",
      "name" => name,
      "type_line" => "Artifact",
      "cmc" => 0.0,
      "colors" => [],
      "color_identity" => [],
      "set" => "tst",
      "set_name" => "Test Set",
      "collector_number" => slug,
      "lang" => "en",
      "rarity" => "rare",
      "finishes" => ["nonfoil"],
      "prices" => %{"usd" => scryfall_price},
      "released_at" => "2026-01-01"
    }
  end
end
