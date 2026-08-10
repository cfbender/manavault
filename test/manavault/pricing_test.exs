defmodule Manavault.PricingTest do
  use Manavault.DataCase

  alias Manavault.Catalog.{Price, Printing}
  alias Manavault.Pricing
  alias Manavault.Pricing.{Money, Store, Sync, VendorPrice}
  alias Manavault.Pricing.Vendors.{CardKingdom, ManaPool, TcgTracking}

  describe "Money.to_cents/1" do
    test "parses decimal dollar strings" do
      assert Money.to_cents("0.35") == 35
      assert Money.to_cents("12.5") == 1250
      assert Money.to_cents("479.95") == 47_995
      assert Money.to_cents(" 3.00 ") == 300
    end

    test "converts numbers" do
      assert Money.to_cents(5) == 500
      assert Money.to_cents(9.57) == 957
    end

    test "rejects missing, malformed, zero, and negative values" do
      assert Money.to_cents(nil) == nil
      assert Money.to_cents("") == nil
      assert Money.to_cents("free") == nil
      assert Money.to_cents("0.00") == nil
      assert Money.to_cents(-3) == nil
      assert Money.to_cents(%{}) == nil
    end
  end

  describe "CardKingdom.rows/1" do
    test "maps products to finish-keyed rows" do
      body = %{
        "data" => [
          %{
            "scryfall_id" => "aaa",
            "variation" => "",
            "is_foil" => "false",
            "price_retail" => "0.35"
          },
          %{
            "scryfall_id" => "bbb",
            "variation" => "",
            "is_foil" => "true",
            "price_retail" => "1.25"
          },
          %{
            "scryfall_id" => "ccc",
            "variation" => "Foil Etched",
            "is_foil" => "true",
            "price_retail" => "9.99"
          },
          %{
            "scryfall_id" => "",
            "variation" => "",
            "is_foil" => "false",
            "price_retail" => "1.00"
          },
          %{
            "scryfall_id" => "ddd",
            "variation" => "",
            "is_foil" => "false",
            "price_retail" => "0.00"
          }
        ]
      }

      assert CardKingdom.rows(body) == [
               %{scryfall_id: "aaa", finish: "nonfoil", price_cents: 35},
               %{scryfall_id: "bbb", finish: "foil", price_cents: 125},
               %{scryfall_id: "ccc", finish: "etched", price_cents: 999}
             ]
    end

    test "decodes a JSON body served without a JSON content type" do
      body =
        Jason.encode!(%{
          "data" => [
            %{
              "scryfall_id" => "aaa",
              "variation" => "",
              "is_foil" => "false",
              "price_retail" => "0.35"
            }
          ]
        })

      assert CardKingdom.rows(body) == [
               %{scryfall_id: "aaa", finish: "nonfoil", price_cents: 35}
             ]
    end

    test "tolerates unexpected payloads" do
      assert CardKingdom.rows(%{}) == []
      assert CardKingdom.rows("nope") == []
    end
  end

  describe "ManaPool.rows/1" do
    test "maps singles to finish-keyed rows in cents" do
      body = %{
        "data" => [
          %{
            "scryfall_id" => "aaa",
            "price_cents" => 218,
            "price_cents_foil" => 2017,
            "price_cents_etched" => nil
          },
          %{"scryfall_id" => "bbb", "price_cents" => nil, "price_cents_foil" => 16},
          %{"scryfall_id" => "", "price_cents" => 100}
        ]
      }

      assert ManaPool.rows(body) == [
               %{scryfall_id: "aaa", finish: "nonfoil", price_cents: 218},
               %{scryfall_id: "aaa", finish: "foil", price_cents: 2017},
               %{scryfall_id: "bbb", finish: "foil", price_cents: 16}
             ]
    end

    test "tolerates unexpected payloads" do
      assert ManaPool.rows(%{}) == []
      assert ManaPool.rows([1, 2]) == []
    end
  end

  describe "TcgTracking.rows/2" do
    test "joins products with pricing, preferring market over low" do
      cards = %{
        "products" => [
          %{"id" => 1, "scryfall_id" => "aaa"},
          %{"id" => 2, "scryfall_id" => "bbb"}
        ]
      }

      pricing = %{
        "prices" => %{
          "1" => %{
            "tcg" => %{
              "Normal" => %{"low" => 35.09, "market" => 35.93},
              "Foil" => %{"low" => 39.99, "market" => nil}
            }
          },
          "2" => %{"tcg" => %{"Foil Etched" => %{"market" => 9.57}}}
        }
      }

      rows = TcgTracking.rows(cards, pricing) |> Enum.sort_by(&{&1.scryfall_id, &1.finish})

      assert rows == [
               %{scryfall_id: "aaa", finish: "foil", price_cents: 3999},
               %{scryfall_id: "aaa", finish: "nonfoil", price_cents: 3593},
               %{scryfall_id: "bbb", finish: "etched", price_cents: 957}
             ]
    end

    test "falls back to the cardtrader scryfall_id for special treatments" do
      cards = %{
        "products" => [
          %{
            "id" => 709_470,
            "scryfall_id" => nil,
            "cardtrader" => [%{"scryfall_id" => "42a1986c"}]
          }
        ]
      }

      pricing = %{
        "prices" => %{
          "709470" => %{"tcg" => %{"Foil" => %{"low" => 650.98, "market" => 675.49}}}
        }
      }

      assert TcgTracking.rows(cards, pricing) == [
               %{scryfall_id: "42a1986c", finish: "foil", price_cents: 67_549}
             ]
    end

    test "skips products without any scryfall_id or pricing" do
      cards = %{
        "products" => [%{"id" => 1, "scryfall_id" => nil}, %{"id" => 2, "scryfall_id" => "bbb"}]
      }

      pricing = %{"prices" => %{"1" => %{"tcg" => %{"Normal" => %{"market" => 1.0}}}}}

      assert TcgTracking.rows(cards, pricing) == []
      assert TcgTracking.rows(%{}, %{}) == []
    end
  end

  describe "Sync.replace_vendor_prices/2" do
    test "keeps the cheapest duplicate, upserts, and removes stale rows" do
      Sync.replace_vendor_prices("manapool", [
        %{scryfall_id: "aaa", finish: "nonfoil", price_cents: 100},
        %{scryfall_id: "stale", finish: "nonfoil", price_cents: 50}
      ])

      result =
        Sync.replace_vendor_prices("manapool", [
          %{scryfall_id: "aaa", finish: "nonfoil", price_cents: 300},
          %{scryfall_id: "aaa", finish: "nonfoil", price_cents: 200},
          %{scryfall_id: "aaa", finish: "foil", price_cents: 400}
        ])

      assert result == %{upserted: 2, deleted: 1}

      prices =
        VendorPrice
        |> Repo.all()
        |> Map.new(fn row -> {{row.scryfall_id, row.finish}, row.price_cents} end)

      assert prices == %{{"aaa", "nonfoil"} => 200, {"aaa", "foil"} => 400}
    end

    test "leaves other vendors untouched" do
      Sync.replace_vendor_prices("manapool", [
        %{scryfall_id: "aaa", finish: "nonfoil", price_cents: 100}
      ])

      Sync.replace_vendor_prices("cardkingdom", [
        %{scryfall_id: "aaa", finish: "nonfoil", price_cents: 111}
      ])

      assert Repo.aggregate(VendorPrice, :count) == 2
    end
  end

  describe "settings" do
    test "defaults to scryfall and validates sources" do
      assert Pricing.settings().source == "scryfall"

      assert {:ok, %{source: "tcgplayer"}} = Pricing.set_source("tcgplayer")
      assert Pricing.settings().source == "tcgplayer"

      assert {:error, changeset} = Pricing.set_source("ebay")
      refute changeset.valid?
      assert Pricing.settings().source == "tcgplayer"
    end
  end

  describe "price resolution through Catalog.Price" do
    setup do
      start_supervised!(Store)
      :ok
    end

    test "vendor price wins over Scryfall, exact finish first" do
      Sync.replace_vendor_prices("manapool", [
        %{scryfall_id: "print-1", finish: "foil", price_cents: 65_098}
      ])

      {:ok, _settings} = Pricing.set_source("manapool")

      printing = %Printing{
        scryfall_id: "print-1",
        prices: Jason.encode!(%{"usd_foil" => "198.04"})
      }

      assert Price.price_cents_for_printing(printing, "foil") == 65_098
      # Chain falls through to the vendor foil price even without a finish.
      assert Price.price_cents_for_printing(printing) == 65_098
    end

    test "falls back to Scryfall when the vendor has no price" do
      {:ok, _settings} = Pricing.set_source("manapool")

      printing = %Printing{
        scryfall_id: "print-2",
        prices: Jason.encode!(%{"usd" => "12.34"})
      }

      assert Price.price_cents_for_printing(printing, "nonfoil") == 1234
    end

    test "scryfall source ignores vendor rows entirely" do
      Sync.replace_vendor_prices("manapool", [
        %{scryfall_id: "print-3", finish: "nonfoil", price_cents: 999}
      ])

      {:ok, _settings} = Pricing.set_source("scryfall")

      printing = %Printing{
        scryfall_id: "print-3",
        prices: Jason.encode!(%{"usd" => "1.00"})
      }

      assert Price.price_cents_for_printing(printing, "nonfoil") == 100
    end
  end
end
