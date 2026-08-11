defmodule Manavault.Catalog.SyncTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus]

  import ExUnit.CaptureLog

  alias Manavault.Catalog

  alias Manavault.Catalog.{
    Card,
    CollectionItem,
    DeckAllocation,
    DeckCard,
    Printing,
    Sync
  }

  test "sync_scryfall downloads bulk metadata and records success" do
    metadata_url = "https://example.test/metadata"
    download_url = "https://example.test/default-cards.jsonl.gz"

    fetcher = fn
      ^metadata_url -> {:ok, Jason.encode!(%{"jsonl_download_uri" => download_url})}
      ^download_url -> {:ok, gzip_jsonl([@black_lotus])}
    end

    assert {:ok,
            %Sync{
              status: "succeeded",
              cards_count: 1,
              printings_count: 1,
              bulk_uri: ^download_url
            }} =
             Catalog.sync_scryfall(
               fetcher: fetcher,
               bulk_url: metadata_url,
               oracle_tags_bulk_url: nil
             )

    assert %Sync{status: "succeeded"} = Catalog.latest_sync()
    assert Repo.aggregate(Card, :count) == 1
    assert Repo.aggregate(Printing, :count) == 1
  end

  test "sync_scryfall imports current gzip JSON Lines Hobbit cards" do
    metadata_url = "https://example.test/metadata"
    download_url = "https://example.test/default-cards.jsonl.gz"

    gleaming_splendor =
      hobbit_card(
        "42a1986c-9585-4544-b5a7-bee4be5c4506",
        "c01aeaa5-1d3b-4493-9575-30175dcd780d",
        "Gleaming Splendor",
        "275"
      )
      |> Map.put("promo_types", ["surgefoil", "universesbeyond"])

    long_bodied_grey_dog =
      hobbit_card(
        "d1a1e520-1fe2-4529-8afb-c187bb80da3c",
        "6f83da19-fd89-44ec-88f3-0c3fddfbd1b2",
        "Long-Bodied Grey Dog",
        "1"
      )

    fetcher = fn
      ^metadata_url -> {:ok, Jason.encode!(%{"jsonl_download_uri" => download_url})}
      ^download_url -> {:ok, gzip_jsonl([gleaming_splendor, long_bodied_grey_dog])}
    end

    assert {:ok, %Sync{status: "succeeded", cards_count: 2, printings_count: 2}} =
             Catalog.sync_scryfall(
               fetcher: fetcher,
               bulk_url: metadata_url,
               oracle_tags_bulk_url: nil
             )

    assert %Card{name: "Gleaming Splendor"} =
             Repo.get!(Card, "c01aeaa5-1d3b-4493-9575-30175dcd780d")

    assert %Printing{
             set_code: "hob",
             collector_number: "275",
             promo_types: promo_types
           } =
             Catalog.get_printing_by_scryfall_id("42a1986c-9585-4544-b5a7-bee4be5c4506")

    assert Jason.decode!(promo_types) == ["surgefoil", "universesbeyond"]

    assert %Card{name: "Long-Bodied Grey Dog"} =
             Repo.get!(Card, "6f83da19-fd89-44ec-88f3-0c3fddfbd1b2")
  end

  test "sync_scryfall only keeps paper printings and moves existing allocations to another printing" do
    digital_lotus = %{@black_lotus | "games" => ["arena"]}

    paper_lotus =
      %{
        @black_lotus
        | "id" => "scryfall-paper-lotus",
          "set" => "pap",
          "set_name" => "Paper Set",
          "collector_number" => "1"
      }

    assert {:ok, _counts} = Catalog.import_cards([digital_lotus, paper_lotus])

    assert {:ok, item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => digital_lotus["id"],
               "quantity" => 1,
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil"
             })

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Paper Sync"})

    assert {:ok, deck_card} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Black Lotus",
               "quantity" => 1,
               "preferred_printing_id" => digital_lotus["id"]
             })

    assert {:ok, allocation} =
             Catalog.allocate_collection_item_to_deck_card(deck_card.id, item.id)

    metadata_url = "https://example.test/paper-metadata"
    download_url = "https://example.test/paper-default-cards.jsonl.gz"

    arena_only = %{
      @black_lotus
      | "id" => "arena-only",
        "oracle_id" => "arena-only-oracle",
        "games" => ["arena"]
    }

    fetcher = fn
      ^metadata_url -> {:ok, Jason.encode!(%{"jsonl_download_uri" => download_url})}
      ^download_url -> {:ok, gzip_jsonl([paper_lotus, arena_only])}
    end

    assert {:ok, %Sync{cards_count: 1, printings_count: 1}} =
             Catalog.sync_scryfall(
               fetcher: fetcher,
               bulk_url: metadata_url,
               oracle_tags_bulk_url: nil
             )

    refute Repo.get(Printing, digital_lotus["id"])
    refute Repo.get(Printing, "arena-only")
    assert Repo.get!(CollectionItem, item.id).scryfall_id == paper_lotus["id"]
    assert Repo.get!(DeckCard, deck_card.id).preferred_printing_id == paper_lotus["id"]
    assert Repo.get!(DeckAllocation, allocation.id).collection_item_id == item.id
  end

  test "sync_scryfall deletes cards left without paper printings" do
    digital_only = %{
      @black_lotus
      | "id" => "digital-only-printing",
        "oracle_id" => "digital-only-oracle",
        "name" => "Digital Only Card",
        "games" => ["arena"]
    }

    assert {:ok, %{cards_count: 1, printings_count: 1}} =
             Catalog.import_cards([digital_only])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Digital Only Deck"})

    assert {:ok, deck_card} =
             Catalog.add_card_to_deck(deck, %{"name" => digital_only["name"], "quantity" => 1})

    metadata_url = "https://example.test/orphan-cleanup-metadata"
    download_url = "https://example.test/orphan-cleanup-default-cards.jsonl.gz"

    fetcher = fn
      ^metadata_url -> {:ok, Jason.encode!(%{"jsonl_download_uri" => download_url})}
      ^download_url -> {:ok, gzip_jsonl([@black_lotus])}
    end

    assert {:ok, %Sync{status: "succeeded"}} =
             Catalog.sync_scryfall(
               fetcher: fetcher,
               bulk_url: metadata_url,
               oracle_tags_bulk_url: nil
             )

    refute Repo.get(Printing, digital_only["id"])
    refute Repo.get(Card, digital_only["oracle_id"])
    refute Repo.get(DeckCard, deck_card.id)
  end

  test "sync_scryfall deletes existing memorabilia and token set printings" do
    memorabilia =
      %{
        @black_lotus
        | "id" => "existing-memorabilia",
          "set" => "alea",
          "set_name" => "Alpha Art Series"
      }

    token =
      %{
        @black_lotus
        | "id" => "existing-token",
          "oracle_id" => "existing-token-oracle",
          "name" => "Black Lotus Token",
          "set" => "tlea",
          "set_name" => "Alpha Tokens"
      }

    assert {:ok, %{printings_count: 3}} =
             Catalog.import_cards([@black_lotus, memorabilia, token])

    metadata_url = "https://example.test/filtered-metadata"
    download_url = "https://example.test/filtered-default-cards.jsonl.gz"

    fetcher = fn
      ^metadata_url ->
        {:ok, Jason.encode!(%{"jsonl_download_uri" => download_url})}

      ^download_url ->
        {:ok,
         gzip_jsonl([
           @black_lotus,
           Map.put(memorabilia, "set_type", "memorabilia"),
           Map.put(token, "set_type", "token")
         ])}
    end

    assert {:ok, %Sync{cards_count: 1, printings_count: 1}} =
             Catalog.sync_scryfall(
               fetcher: fetcher,
               bulk_url: metadata_url,
               oracle_tags_bulk_url: nil
             )

    assert Repo.get!(Printing, @black_lotus["id"])
    refute Repo.get(Printing, memorabilia["id"])
    refute Repo.get(Printing, token["id"])

    assert %{rows: []} =
             Repo.query!(
               "SELECT scryfall_id FROM scryfall_printing_search WHERE scryfall_id IN (?, ?)",
               [memorabilia["id"], token["id"]]
             )
  end

  test "sync_scryfall only runs the paper printing reconciliation once" do
    metadata_url = "https://example.test/one-time-paper-metadata"
    download_url = "https://example.test/one-time-paper-cards.jsonl.gz"

    fetcher = fn
      ^metadata_url -> {:ok, Jason.encode!(%{"jsonl_download_uri" => download_url})}
      ^download_url -> {:ok, gzip_jsonl([@black_lotus])}
    end

    sync_opts = [
      fetcher: fetcher,
      bulk_url: metadata_url,
      oracle_tags_bulk_url: nil
    ]

    assert {:ok, %Sync{status: "succeeded"}} = Catalog.sync_scryfall(sync_opts)

    digital_card = %{
      @black_lotus
      | "id" => "digital-after-paper-migration",
        "oracle_id" => "digital-after-paper-migration-oracle",
        "games" => ["arena"]
    }

    assert {:ok, _counts} = Catalog.import_cards([digital_card])
    assert {:ok, %Sync{status: "succeeded"}} = Catalog.sync_scryfall(sync_opts)

    assert Repo.get(Printing, digital_card["id"])
  end

  test "sync_scryfall emits info progress logs" do
    metadata_url = "https://example.test/metadata-logs"
    download_url = "https://example.test/default-cards-logs.jsonl.gz"

    fetcher = fn
      ^metadata_url -> {:ok, Jason.encode!(%{"jsonl_download_uri" => download_url})}
      ^download_url -> {:ok, gzip_jsonl([@black_lotus])}
    end

    previous_level = Logger.level()
    Logger.configure(level: :info)

    log =
      try do
        capture_log(fn ->
          assert {:ok, %Sync{status: "succeeded", cards_count: 1, printings_count: 1}} =
                   Catalog.sync_scryfall(
                     fetcher: fetcher,
                     bulk_url: metadata_url,
                     oracle_tags_bulk_url: nil
                   )
        end)
      after
        Logger.configure(level: previous_level)
      end

    assert log =~ "Scryfall catalog sync started sync_id="
    assert log =~ "Scryfall catalog sync fetching default-cards metadata"
    assert log =~ "Scryfall catalog sync downloaded default-cards bulk"
    assert log =~ "Scryfall catalog sync decoded default-cards bulk"

    assert log =~
             "Scryfall catalog import progress source_cards=1/1 cards=1 printings=1 search_rows=1"

    assert log =~ "Scryfall catalog import completed source_cards=1 cards=1 printings=1"
    assert log =~ "Scryfall catalog sync succeeded"
  end

  test "sync_scryfall imports oracle-tags bulk data and attaches deck grouping" do
    metadata_url = "https://example.test/metadata"
    download_url = "https://example.test/default-cards.jsonl.gz"
    oracle_tags_metadata_url = "https://example.test/oracle-tags-metadata"
    oracle_tags_download_url = "https://example.test/oracle-tags.jsonl.gz"

    fetcher = fn
      ^metadata_url ->
        {:ok, Jason.encode!(%{"jsonl_download_uri" => download_url})}

      ^download_url ->
        {:ok, gzip_jsonl([@black_lotus])}

      ^oracle_tags_metadata_url ->
        {:ok, Jason.encode!(%{"jsonl_download_uri" => oracle_tags_download_url})}

      ^oracle_tags_download_url ->
        {:ok,
         gzip_jsonl([
           scryfall_tag(%{
             "id" => "tag-ramp",
             "slug" => "ramp",
             "label" => "Ramp",
             "type" => "function",
             "taggings" => [%{"oracle_id" => "oracle-1", "weight" => 0.88}]
           })
         ])}
    end

    assert {:ok, %Sync{status: "succeeded", cards_count: 1, printings_count: 1}} =
             Catalog.sync_scryfall(
               fetcher: fetcher,
               bulk_url: metadata_url,
               oracle_tags_bulk_url: oracle_tags_metadata_url
             )

    assert %Card{
             deck_category: "ramp",
             oracle_tags: tags_json,
             deck_themes: themes_json
           } = Repo.get!(Card, "oracle-1")

    assert [ramp_tag] = Jason.decode!(tags_json)

    assert Map.take(ramp_tag, ["id", "slug", "label", "weight"]) == %{
             "id" => "tag-ramp",
             "slug" => "ramp",
             "label" => "Ramp",
             "weight" => 0.88
           }

    assert "ramp" in Jason.decode!(themes_json)
  end

  test "sync_scryfall rejects former JSON-array bulk metadata" do
    metadata_url = "https://example.test/legacy-metadata"
    download_url = "https://example.test/default-cards.json"

    fetcher = fn
      ^metadata_url -> {:ok, Jason.encode!(%{"download_uri" => download_url})}
      ^download_url -> flunk("legacy bulk payload should not be fetched")
    end

    assert {:error, %Sync{status: "failed", error: error}} =
             Catalog.sync_scryfall(
               fetcher: fetcher,
               bulk_url: metadata_url,
               oracle_tags_bulk_url: nil
             )

    assert error == "Scryfall bulk metadata did not include jsonl_download_uri"
    assert Repo.aggregate(Card, :count) == 0
    assert Repo.aggregate(Printing, :count) == 0
  end

  test "sync_scryfall validates JSON Lines before committing any batch" do
    metadata_url = "https://example.test/malformed-metadata"
    download_url = "https://example.test/malformed-default-cards.jsonl.gz"

    valid_lines =
      Enum.map(1..200, fn index ->
        @black_lotus
        |> Map.put("id", "scryfall-valid-#{index}")
        |> Map.put("oracle_id", "oracle-valid-#{index}")
        |> Map.put("name", "Valid Card #{index}")
        |> Jason.encode!()
      end)

    fetcher = fn
      ^metadata_url -> {:ok, Jason.encode!(%{"jsonl_download_uri" => download_url})}
      ^download_url -> {:ok, gzip_jsonl_lines(valid_lines ++ ["{not-json"])}
    end

    assert {:error, %Sync{status: "failed", error: error}} =
             Catalog.sync_scryfall(
               fetcher: fetcher,
               bulk_url: metadata_url,
               oracle_tags_bulk_url: nil
             )

    assert error =~ "Invalid Scryfall JSON Lines record"
    assert Repo.aggregate(Card, :count) == 0
    assert Repo.aggregate(Printing, :count) == 0
  end

  test "sync_scryfall records failures without importing partial catalog data" do
    metadata_url = "https://example.test/metadata"

    fetcher = fn ^metadata_url -> {:error, "network unavailable"} end

    {{:error, %Sync{status: "failed", error: error}}, log} =
      with_log(fn ->
        Catalog.sync_scryfall(fetcher: fetcher, bulk_url: metadata_url)
      end)

    assert log =~ "Scryfall catalog sync failed"
    assert error == "network unavailable"
    assert Repo.aggregate(Card, :count) == 0
    assert Repo.aggregate(Printing, :count) == 0
  end

  defp hobbit_card(id, oracle_id, name, collector_number) do
    %{
      @black_lotus
      | "id" => id,
        "oracle_id" => oracle_id,
        "name" => name,
        "set" => "hob",
        "set_name" => "The Hobbit",
        "collector_number" => collector_number,
        "released_at" => "2026-08-14"
    }
  end

  defp gzip_jsonl(records) do
    records
    |> Enum.map(&Jason.encode!/1)
    |> gzip_jsonl_lines()
  end

  defp gzip_jsonl_lines(lines) do
    lines
    |> Enum.join("\n")
    |> Kernel.<>("\n")
    |> :zlib.gzip()
  end
end
