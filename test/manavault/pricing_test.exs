defmodule Manavault.PricingTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus]

  alias Manavault.Catalog
  alias Manavault.Catalog.{Price, Printing}
  alias Manavault.Pricing
  alias Manavault.Pricing.{Money, Store, Sync, VendorPrice}
  alias Manavault.Pricing.Vendors.{CardKingdom, ManaPool, TcgTracking}

  @mana_pool_stub __MODULE__

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
    test "maps ordinary printings from market prices and etched printings from listings" do
      body = %{
        "data" => [
          mana_pool_single("aaa", 500, 750),
          mana_pool_single("bbb", 300, nil),
          mana_pool_single("ccc", nil, 200),
          mana_pool_single("ddd", 100, 150, %{"price_cents_nm_etched" => 900})
        ]
      }

      assert MapSet.new(ManaPool.rows(body)) ==
               MapSet.new([
                 %{scryfall_id: "aaa", finish: "nonfoil", price_cents: 500},
                 %{scryfall_id: "aaa", finish: "foil", price_cents: 750},
                 %{scryfall_id: "bbb", finish: "nonfoil", price_cents: 300},
                 %{scryfall_id: "ccc", finish: "foil", price_cents: 200},
                 %{scryfall_id: "ddd", finish: "nonfoil", price_cents: 100},
                 %{scryfall_id: "ddd", finish: "foil", price_cents: 150},
                 %{scryfall_id: "ddd", finish: "etched", price_cents: 900}
               ])
    end

    test "uses treatment-specific listings instead of generic market prices" do
      surge_foil_id = "42a1986c-9585-4544-b5a7-bee4be5c4506"

      body = %{
        "data" => [
          mana_pool_single(surge_foil_id, 8595, 20_955, %{
            "price_cents" => nil,
            "price_cents_nm" => nil,
            "price_cents_foil" => 43_000,
            "price_cents_lp_plus_foil" => 43_000,
            "price_cents_nm_foil" => 43_000
          })
        ]
      }

      assert ManaPool.rows(body, MapSet.new([surge_foil_id])) == [
               %{scryfall_id: surge_foil_id, finish: "foil", price_cents: 43_000}
             ]
    end

    test "fetch identifies special treatments from imported Scryfall metadata" do
      surge_foil_id = "42a1986c-9585-4544-b5a7-bee4be5c4506"

      gleaming_splendor =
        Map.merge(@black_lotus, %{
          "id" => surge_foil_id,
          "oracle_id" => "c01aeaa5-1d3b-4493-9575-30175dcd780d",
          "name" => "Gleaming Splendor",
          "set" => "hob",
          "collector_number" => "275",
          "finishes" => ["foil"],
          "promo_types" => ["surgefoil", "universesbeyond"]
        })

      assert {:ok, _counts} = Catalog.import_cards([gleaming_splendor])

      body = %{
        "data" => [
          mana_pool_single(surge_foil_id, 8595, 20_955, %{
            "price_cents_nm_foil" => 43_000
          })
        ]
      }

      Req.Test.stub(@mana_pool_stub, fn conn ->
        conn
        |> Plug.Conn.put_resp_content_type("application/json")
        |> Plug.Conn.send_resp(200, Jason.encode!(body))
      end)

      assert ManaPool.fetch(plug: {Req.Test, @mana_pool_stub}) ==
               {:ok, [%{scryfall_id: surge_foil_id, finish: "foil", price_cents: 43_000}]}
    end

    test "skips missing and invalid market prices" do
      body = %{
        "data" => [
          mana_pool_single("aaa", nil, nil),
          mana_pool_single("bbb", 0, -100),
          mana_pool_single("", 200, 300),
          %{"scryfall_id" => "ccc", "low_price" => 400},
          %{"scryfall_id" => "aaa"}
        ]
      }

      assert ManaPool.rows(body) == []
    end

    test "tolerates unexpected payloads" do
      assert ManaPool.rows(%{}) == []
      assert ManaPool.rows([1, 2]) == []
    end
  end

  defp mana_pool_single(scryfall_id, market_price, foil_market_price, extra \\ %{}) do
    Map.merge(
      %{
        "scryfall_id" => scryfall_id,
        "price_market" => market_price,
        "price_market_foil" => foil_market_price
      },
      extra
    )
  end

  describe "TcgTracking.rows/2" do
    test "joins products with market pricing and ignores low-only prices" do
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
