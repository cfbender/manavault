defmodule Manavault.Catalog.DeckCrudTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus, :time_walk]

  alias Manavault.Catalog

  alias Manavault.Catalog.{
    Deck,
    DeckCard
  }

  test "deck CRUD stores card identities with optional preferred printings" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, %Deck{} = deck} =
             Catalog.create_deck(%{
               "name" => "Powered",
               "format" => "vintage",
               "status" => "brewing"
             })

    assert {:ok, %DeckCard{} = lotus} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Black Lotus",
               "quantity" => "1",
               "zone" => "mainboard",
               "preferred_printing_id" => "scryfall-printing-1"
             })

    assert lotus.oracle_id == "oracle-1"
    assert lotus.preferred_printing_id == "scryfall-printing-1"

    assert {:ok, %DeckCard{} = updated_lotus} =
             Catalog.add_card_to_deck(deck, %{
               "oracle_id" => "oracle-1",
               "quantity" => "2",
               "zone" => "mainboard"
             })

    assert updated_lotus.id == lotus.id
    assert updated_lotus.quantity == 3

    assert {:ok, %DeckCard{} = commander} =
             Catalog.add_card_to_deck(deck, %{
               "oracle_id" => "oracle-2",
               "quantity" => 1,
               "zone" => "commander"
             })

    loaded = Catalog.get_deck!(deck.id)
    assert Enum.map(loaded.deck_cards, & &1.card.name) == ["Time Walk", "Black Lotus"]

    stats = Catalog.deck_stats(loaded)
    assert stats.total == 4
    assert stats.zones == %{"commander" => 1, "mainboard" => 3}
    assert stats.types["Artifact"] == 3
    assert stats.types["Sorcery"] == 1

    assert {:ok, %DeckCard{zone: "sideboard", quantity: 2}} =
             Catalog.update_deck_card(commander, %{"zone" => "sideboard", "quantity" => "2"})

    assert {:ok, [%DeckCard{tag: "getting"}]} =
             Catalog.update_deck_cards_tag([commander.id], "getting")

    assert [%DeckCard{tag: "getting"}] =
             Catalog.get_deck!(deck.id).deck_cards
             |> Enum.filter(&(&1.id == commander.id))

    assert {:ok, [%DeckCard{tag: nil}]} = Catalog.update_deck_cards_tag([commander.id], nil)

    assert {:error, %Ecto.Changeset{}} = Catalog.update_deck_cards_tag([commander.id], "maybe")

    assert {:ok, _deleted} = Catalog.delete_deck_card(updated_lotus)

    assert {:ok, %Deck{name: "Powered Updated"}} =
             Catalog.update_deck(deck, %{"name" => "Powered Updated"})

    assert {:ok, _deleted_deck} = Catalog.delete_deck(Catalog.get_deck!(deck.id))
    assert [] = Catalog.list_decks()
  end

  test "list_deck_summaries returns counts cover and commander colors without preloading cards" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Summary Test"})

    assert {:ok, _mainboard} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Black Lotus",
               "quantity" => 2,
               "zone" => "mainboard"
             })

    assert {:ok, _commander} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Time Walk",
               "quantity" => 1,
               "zone" => "commander"
             })

    assert [%Deck{} = summary] = Catalog.list_deck_summaries()
    assert summary.card_count == 3
    assert summary.unique_card_count == 2
    assert summary.commander_color_identity == ["U"]
    assert summary.cover_image_url == "https://example.test/black-lotus.jpg"
    assert %Ecto.Association.NotLoaded{} = summary.deck_cards
  end

  test "deck stats total excludes sideboard and maybeboard cards" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Count Test"})

    assert {:ok, _mainboard} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Black Lotus",
               "quantity" => 2,
               "zone" => "mainboard"
             })

    assert {:ok, _commander} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Time Walk",
               "quantity" => 1,
               "zone" => "commander"
             })

    assert {:ok, _sideboard} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Black Lotus",
               "quantity" => 4,
               "zone" => "sideboard"
             })

    assert {:ok, _maybeboard} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Time Walk",
               "quantity" => 8,
               "zone" => "maybeboard"
             })

    stats = deck.id |> Catalog.get_deck!() |> Catalog.deck_stats()

    assert stats.total == 3

    assert stats.zones == %{
             "commander" => 1,
             "mainboard" => 2,
             "maybeboard" => 8,
             "sideboard" => 4
           }
  end
end
