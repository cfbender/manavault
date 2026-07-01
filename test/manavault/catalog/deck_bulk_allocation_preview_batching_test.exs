defmodule Manavault.Catalog.DeckBulkAllocationPreviewBatchingTest do
  use Manavault.DataCase, async: true

  alias Manavault.Catalog
  alias Manavault.Catalog.Decks.Allocations

  @card_count 6

  setup do
    cards =
      for index <- 1..@card_count do
        %{
          "id" => "scryfall-preview-batch-#{index}",
          "oracle_id" => "oracle-preview-batch-#{index}",
          "name" => "Preview Batch #{index}",
          "type_line" => "Artifact",
          "collector_number" => "#{index}",
          "set" => "pbt",
          "set_name" => "Preview Batch Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      end

    assert {:ok, %{cards_count: @card_count}} = Catalog.import_cards(cards)
    {:ok, location} = Catalog.create_location(%{name: "Preview Binder", kind: "binder"})

    for index <- 1..@card_count do
      assert {:ok, _item} =
               Catalog.create_collection_item(%{
                 scryfall_id: "scryfall-preview-batch-#{index}",
                 quantity: 1,
                 finish: "nonfoil",
                 location_id: location.id
               })
    end

    {:ok, deck} = Catalog.create_deck(%{"name" => "Preview Batch Deck"})

    for index <- 1..@card_count do
      assert {:ok, _deck_card} =
               Catalog.add_card_to_deck(deck, %{"name" => "Preview Batch #{index}"})
    end

    %{deck: deck}
  end

  test "preview allocation status is batched, not one set of queries per card", %{deck: deck} do
    {result, query_count} =
      count_repo_queries(fn ->
        # Call the module directly to bypass the read-through cache so the query
        # count reflects the batched computation itself.
        Allocations.preview_bulk_allocate_deck(deck, :matching_printings)
      end)

    assert {:ok, preview} = result
    assert preview.allocated == @card_count
    assert preview.cards == @card_count

    # Batched: a fixed handful of queries regardless of card count. The old
    # per-card path issued ~5 queries per deck card (~30+ for six cards).
    assert query_count <= 12
  end

  defp count_repo_queries(fun) when is_function(fun, 0) do
    caller = self()
    ref = make_ref()
    handler_id = {__MODULE__, ref}

    :ok =
      :telemetry.attach(
        handler_id,
        [:manavault, :repo, :query],
        fn _event, _measurements, metadata, _config ->
          unless metadata[:source] == "schema_migrations" do
            send(caller, {ref, :query})
          end
        end,
        nil
      )

    try do
      result = fun.()
      {result, collect_query_count(ref, 0)}
    after
      :telemetry.detach(handler_id)
      collect_query_count(ref, 0)
    end
  end

  defp collect_query_count(ref, count) do
    receive do
      {^ref, :query} -> collect_query_count(ref, count + 1)
    after
      0 -> count
    end
  end
end
