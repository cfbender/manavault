defmodule Manavault.Catalog.PriceFallbackConsistencyTest do
  use Manavault.DataCase

  import Ecto.Query

  import Manavault.Catalog.PriceFragments,
    only: [price_cents_fragment: 2, price_value_fragment: 2]

  alias Manavault.Catalog
  alias Manavault.Catalog.{CollectionItem, Price, Printing}
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
end
