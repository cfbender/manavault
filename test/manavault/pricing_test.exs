defmodule Manavault.PricingTest do
  use Manavault.DataCase

  alias Manavault.Catalog
  alias Manavault.Catalog.{Price, Printing}
  alias Manavault.CatalogTestSupport
  alias Manavault.Pricing
  alias Manavault.Pricing.{Money, Store, Sync, VendorPrice}
  alias Manavault.Pricing.Vendors.{CardKingdom, ManaPool, TcgCsv}

  @mana_pool_stub __MODULE__
  @tcg_csv_stub Module.concat(__MODULE__, TcgCsv)

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
    test "uses the lowest near-mint listing for each finish, ignoring market prices" do
      body = %{
        "data" => [
          mana_pool_single("aaa", %{
            "price_market" => 500,
            "price_market_foil" => 750,
            "price_cents" => 410,
            "price_cents_lp_plus" => 450,
            "price_cents_nm" => 525,
            "price_cents_foil" => 600,
            "price_cents_lp_plus_foil" => 700,
            "price_cents_nm_foil" => 790,
            "price_cents_etched" => 850,
            "price_cents_lp_plus_etched" => 875,
            "price_cents_nm_etched" => 900
          })
        ]
      }

      assert MapSet.new(ManaPool.rows(body)) ==
               MapSet.new([
                 %{scryfall_id: "aaa", finish: "nonfoil", price_cents: 525},
                 %{scryfall_id: "aaa", finish: "foil", price_cents: 790},
                 %{scryfall_id: "aaa", finish: "etched", price_cents: 900}
               ])
    end

    test "falls back to lightly played or better, then any condition, per finish" do
      body = %{
        "data" => [
          mana_pool_single("aaa", %{
            "price_market" => 999,
            "price_cents" => 147,
            "price_cents_lp_plus" => 290,
            "price_cents_nm" => nil,
            "price_cents_foil" => 310,
            "price_cents_lp_plus_foil" => nil,
            "price_cents_nm_foil" => nil
          })
        ]
      }

      assert MapSet.new(ManaPool.rows(body)) ==
               MapSet.new([
                 %{scryfall_id: "aaa", finish: "nonfoil", price_cents: 290},
                 %{scryfall_id: "aaa", finish: "foil", price_cents: 310}
               ])
    end

    test "never borrows another finish's listing or market price" do
      body = %{
        "data" => [
          mana_pool_single("foil-only", %{
            "price_market" => 8595,
            "price_market_foil" => 20_955,
            "price_cents_nm_foil" => 43_000
          }),
          mana_pool_single("nonfoil-only", %{
            "price_market_foil" => 300,
            "price_cents_nm" => 200
          })
        ]
      }

      assert ManaPool.rows(body) == [
               %{scryfall_id: "foil-only", finish: "foil", price_cents: 43_000},
               %{scryfall_id: "nonfoil-only", finish: "nonfoil", price_cents: 200}
             ]
    end

    test "fetch maps the feed into listing rows" do
      body = %{
        "data" => [
          mana_pool_single("aaa", %{
            "price_market" => 8595,
            "price_cents_lp_plus" => 7000,
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
               {:ok,
                [
                  %{scryfall_id: "aaa", finish: "nonfoil", price_cents: 7000},
                  %{scryfall_id: "aaa", finish: "foil", price_cents: 43_000}
                ]}
    end

    test "skips missing and invalid listing prices" do
      body = %{
        "data" => [
          mana_pool_single("aaa", %{"price_market" => 500, "price_market_foil" => 750}),
          mana_pool_single("bbb", %{"price_cents_nm" => 0, "price_cents_foil" => -100}),
          mana_pool_single("ccc", %{"price_cents_nm" => "12.00"}),
          mana_pool_single("", %{"price_cents_nm" => 200}),
          %{"scryfall_id" => "ddd", "low_price" => 400},
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

  defp mana_pool_single(scryfall_id, prices) do
    Map.merge(%{"scryfall_id" => scryfall_id}, prices)
  end

  describe "TcgCsv.rows/2" do
    test "prices finishes with the TCG low, falling back to the market price" do
      printings = %{
        1 => [{"aaa", false}],
        2 => [{"bbb", false}, {"bbb-promo", false}],
        3 => [{"ccc", true}],
        4 => [{"ddd", false}]
      }

      prices = [
        tcg_csv_price(1, "Normal", 0.25, 0.35),
        tcg_csv_price(1, "Foil", nil, 1.5),
        tcg_csv_price(2, "Normal", 3.0, 4.0),
        tcg_csv_price(3, "Foil", 9.57, 12.0),
        tcg_csv_price(4, "Foil Etched", 5.0, nil)
      ]

      rows = TcgCsv.rows(prices, printings) |> Enum.sort_by(&{&1.scryfall_id, &1.finish})

      assert rows == [
               %{scryfall_id: "aaa", finish: "foil", price_cents: 150},
               %{scryfall_id: "aaa", finish: "nonfoil", price_cents: 25},
               %{scryfall_id: "bbb", finish: "nonfoil", price_cents: 300},
               %{scryfall_id: "bbb-promo", finish: "nonfoil", price_cents: 300},
               %{scryfall_id: "ccc", finish: "etched", price_cents: 957},
               %{scryfall_id: "ddd", finish: "etched", price_cents: 500}
             ]
    end

    test "skips unmatched products, rows without prices, and unexpected payloads" do
      prices = [tcg_csv_price(1, "Normal", nil, nil), tcg_csv_price(99, "Normal", 1.0, 1.0)]

      assert TcgCsv.rows(prices, %{1 => [{"aaa", false}]}) == []
      assert TcgCsv.rows(nil, %{}) == []
    end
  end

  describe "TcgCsv.fetch/1" do
    test "joins every group's prices to printings by TCGplayer product id" do
      {:ok, _result} =
        Catalog.import_cards([
          Map.put(CatalogTestSupport.black_lotus(), "tcgplayer_id", 101),
          Map.merge(CatalogTestSupport.time_walk(), %{
            "tcgplayer_id" => 201,
            "tcgplayer_etched_id" => 202
          })
        ])

      Req.Test.stub(@tcg_csv_stub, fn conn ->
        case conn.request_path do
          "/tcgplayer/1/groups" ->
            Req.Test.json(conn, %{"results" => [%{"groupId" => 1}, %{"groupId" => 2}]})

          "/tcgplayer/1/1/prices" ->
            Req.Test.json(conn, %{"results" => [tcg_csv_price(101, "Normal", 9000.0, 9500.0)]})

          "/tcgplayer/1/2/prices" ->
            conn
            |> Plug.Conn.put_status(500)
            |> Req.Test.json(%{"success" => false})
        end
      end)

      assert TcgCsv.fetch(plug: {Req.Test, @tcg_csv_stub}, request_delay_ms: 0, retry: false) ==
               {:ok,
                [%{scryfall_id: "scryfall-printing-1", finish: "nonfoil", price_cents: 900_000}]}

      assert TcgCsv.product_printings() == %{
               101 => [{"scryfall-printing-1", false}],
               201 => [{"scryfall-printing-2", false}],
               202 => [{"scryfall-printing-2", true}]
             }
    end
  end

  defp tcg_csv_price(product_id, subtype, low, market) do
    %{
      "productId" => product_id,
      "subTypeName" => subtype,
      "lowPrice" => low,
      "marketPrice" => market
    }
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
