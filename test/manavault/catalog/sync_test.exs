defmodule Manavault.Catalog.SyncTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus]

  alias Manavault.Catalog

  alias Manavault.Catalog.{
    Card,
    Printing,
    Sync
  }

  test "sync_scryfall downloads bulk metadata and records success" do
    metadata_url = "https://example.test/metadata"
    download_url = "https://example.test/default-cards.json"

    fetcher = fn
      ^metadata_url -> {:ok, Jason.encode!(%{"download_uri" => download_url})}
      ^download_url -> {:ok, Jason.encode!([@black_lotus])}
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

  test "sync_scryfall imports oracle-tags bulk data and attaches deck grouping" do
    metadata_url = "https://example.test/metadata"
    download_url = "https://example.test/default-cards.json"
    oracle_tags_metadata_url = "https://example.test/oracle-tags-metadata"
    oracle_tags_download_url = "https://example.test/oracle-tags.json"

    fetcher = fn
      ^metadata_url ->
        {:ok, Jason.encode!(%{"download_uri" => download_url})}

      ^download_url ->
        {:ok, Jason.encode!([@black_lotus])}

      ^oracle_tags_metadata_url ->
        {:ok, Jason.encode!(%{"download_uri" => oracle_tags_download_url})}

      ^oracle_tags_download_url ->
        {:ok,
         Jason.encode!([
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

  test "sync_scryfall records failures without importing partial catalog data" do
    metadata_url = "https://example.test/metadata"

    fetcher = fn ^metadata_url -> {:error, "network unavailable"} end

    assert {:error, %Sync{status: "failed", error: error}} =
             Catalog.sync_scryfall(fetcher: fetcher, bulk_url: metadata_url)

    assert error == "network unavailable"
    assert Repo.aggregate(Card, :count) == 0
    assert Repo.aggregate(Printing, :count) == 0
  end
end
