Code.require_file(
  "../../../priv/repo/migrations/20261005000000_deallocate_considering_deck_cards.exs",
  __DIR__
)

defmodule Manavault.Repo.DeallocateConsideringDeckCardsMigrationTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus]

  import Ecto.Query

  alias Manavault.Catalog
  alias Manavault.Catalog.{CollectionItem, DeckAllocation}
  alias Manavault.Repo.Migrations.DeallocateConsideringDeckCards

  test "releasing two partial allocations of one item keeps the copy count and purchase price" do
    assert {:ok, _summary} = Catalog.import_cards([@black_lotus])
    assert {:ok, binder} = Catalog.create_location(%{name: "Binder", kind: "binder"})

    # The state the migration repairs: considering cards holding copies, and two
    # allocations sharing one collection item that holds more copies than either.
    assert {:ok, item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => 3,
               "purchase_price_cents" => 500
             })

    for name <- ["First", "Second"] do
      assert {:ok, deck} = Catalog.create_deck(%{"name" => name})
      assert {:ok, card} = Catalog.add_card_to_deck(deck, %{"name" => "Black Lotus"})

      Repo.update_all(from(dc in "deck_cards", where: dc.id == ^card.id),
        set: [zone: "considering"]
      )

      now = DateTime.utc_now() |> DateTime.truncate(:second)

      Repo.insert!(%DeckAllocation{
        deck_card_id: card.id,
        collection_item_id: item.id,
        source_location_id: binder.id,
        quantity: 1,
        inserted_at: now,
        updated_at: now
      })
    end

    run_migration()

    assert Repo.aggregate(DeckAllocation, :count) == 0
    items = Repo.all(from(ci in CollectionItem, order_by: ci.id))
    assert Enum.sum(Enum.map(items, & &1.quantity)) == 3
    assert [%{id: kept_id, quantity: 1, location_id: nil} | released] = items
    assert kept_id == item.id
    assert [_, _] = released
    assert Enum.all?(released, &(&1.quantity == 1 and &1.location_id == binder.id))
    assert Enum.all?(items, &(&1.purchase_price_cents == 500))
  end

  defp run_migration do
    Ecto.Migrator.run(Repo, [{99_990_101_000_000, DeallocateConsideringDeckCards}], :up,
      all: true,
      log: false
    )
  end
end
