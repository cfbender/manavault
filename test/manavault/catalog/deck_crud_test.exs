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

    assert {:ok, %DeckCard{zone: "considering", quantity: 2}} =
             Catalog.update_deck_card(commander, %{"zone" => "considering", "quantity" => "2"})

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

  test "add_card_to_deck resolves names with or without diacritics" do
    oin =
      @time_walk
      |> Map.merge(%{
        "id" => "scryfall-oin-the-brave",
        "oracle_id" => "oracle-oin-the-brave",
        "name" => "Óin the Brave",
        "collector_number" => "12"
      })

    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([oin])
    assert {:ok, %Deck{} = deck} = Catalog.create_deck(%{"name" => "Diacritic Add"})

    assert {:ok, %DeckCard{id: id, oracle_id: "oracle-oin-the-brave"}} =
             Catalog.add_card_to_deck(deck, %{"name" => "Óin the Brave", "quantity" => 1})

    assert {:ok, %DeckCard{id: ^id, quantity: 2, oracle_id: "oracle-oin-the-brave"}} =
             Catalog.add_card_to_deck(deck, %{"name" => "Oin the brave", "quantity" => 1})
  end

  test "list_deck_summaries returns counts cover and commander colors with preloaded cards" do
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

    assert Manavault.Catalog.Decks.Queries.deck_commander_color_identity(%Deck{id: deck.id}) ==
             ["U"]

    assert summary.cover_image_url == "https://example.test/black-lotus.jpg"
    assert is_list(summary.deck_cards)
    assert length(summary.deck_cards) == 2
  end

  test "commander color identity includes the inferred chosen color of choose-a-color commanders" do
    assert {:ok, _imported} =
             Catalog.import_cards([
               legality_commander_card("Test Doctor", ["U", "R"], %{
                 "type_line" => "Legendary Creature — Time Lord Doctor"
               }),
               legality_commander_card("Test Companion", [], %{
                 "oracle_text" =>
                   "If Test Companion is your commander, choose a color before the game begins. Test Companion is the chosen color.\nDoctor's companion (You can have two commanders if the other is the Doctor.)"
               }),
               legality_card("Green Spell", ["G"], %{"commander" => "legal"})
             ])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Chosen Color", "format" => "commander"})

    add_deck_card!(deck, "Test Doctor", 1, "commander")
    add_deck_card!(deck, "Test Companion", 1, "commander")
    add_deck_card!(deck, "Green Spell", 1, "mainboard")

    # Preloaded deck-cards path.
    assert deck.id |> Catalog.get_deck!() |> Catalog.deck_commander_color_identity() ==
             ["U", "R", "G"]

    # DB summary path (bypass the deck-read cache).
    assert Manavault.Catalog.Decks.Queries.deck_commander_color_identity(%Deck{id: deck.id}) ==
             ["U", "R", "G"]
  end

  test "add_deck_partner promotes a companion from the 99 alongside the Doctor" do
    assert {:ok, _imported} =
             Catalog.import_cards([
               legality_commander_card("Test Doctor", ["U", "R"], %{
                 "type_line" => "Legendary Creature — Time Lord Doctor"
               }),
               legality_commander_card("Test Companion", [], %{
                 "oracle_text" =>
                   "Doctor's companion (You can have two commanders if the other is the Doctor.)"
               })
             ])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Partner Test", "format" => "commander"})

    add_deck_card!(deck, "Test Doctor", 1, "commander")
    companion = add_deck_card!(deck, "Test Companion", 1, "mainboard")

    assert {:ok, %DeckCard{zone: "commander"}} = Catalog.add_deck_partner(companion)

    loaded = Catalog.get_deck!(deck.id)
    commanders = Enum.filter(loaded.deck_cards, &(&1.zone == "commander"))

    assert commanders |> Enum.map(& &1.card.name) |> Enum.sort() ==
             ["Test Companion", "Test Doctor"]
  end

  test "add_deck_partner promotes a Background alongside a choose-a-background commander" do
    assert {:ok, _imported} =
             Catalog.import_cards([
               legality_commander_card("Background Chooser", ["W"], %{
                 "oracle_text" =>
                   "Choose a Background (You can have a Background as a second commander.)"
               }),
               legality_card("Test Background", ["G"], %{"commander" => "legal"}, %{
                 "type_line" => "Legendary Enchantment — Background"
               })
             ])

    assert {:ok, deck} =
             Catalog.create_deck(%{"name" => "Background Test", "format" => "commander"})

    add_deck_card!(deck, "Background Chooser", 1, "commander")
    background = add_deck_card!(deck, "Test Background", 1, "mainboard")

    assert {:ok, %DeckCard{zone: "commander"}} = Catalog.add_deck_partner(background)
  end

  test "add_deck_partner rejects cards without a valid pairing ability" do
    assert {:ok, _imported} =
             Catalog.import_cards([
               legality_commander_card("Solo Commander", ["W"]),
               legality_commander_card("Unpaired Legend", ["G"])
             ])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "No Pair", "format" => "commander"})

    add_deck_card!(deck, "Solo Commander", 1, "commander")
    legend = add_deck_card!(deck, "Unpaired Legend", 1, "mainboard")

    assert {:error, :invalid_commander_pair} = Catalog.add_deck_partner(legend)

    loaded = Catalog.get_deck!(deck.id)

    assert Enum.any?(
             loaded.deck_cards,
             &(&1.card.name == "Unpaired Legend" and &1.zone == "mainboard")
           )

    assert Enum.count(loaded.deck_cards, &(&1.zone == "commander")) == 1
  end

  test "add_deck_partner requires exactly one existing commander" do
    assert {:ok, _imported} =
             Catalog.import_cards([
               legality_commander_card("Partner One", ["W"], %{"oracle_text" => "Partner"}),
               legality_commander_card("Partner Two", ["U"], %{"oracle_text" => "Partner"}),
               legality_commander_card("Partner Three", ["G"], %{"oracle_text" => "Partner"})
             ])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Full Zone", "format" => "commander"})

    candidate = add_deck_card!(deck, "Partner Three", 1, "mainboard")

    assert {:error, :no_commander} = Catalog.add_deck_partner(candidate)

    add_deck_card!(deck, "Partner One", 1, "commander")
    assert {:ok, %DeckCard{zone: "commander"}} = Catalog.add_deck_partner(candidate)

    third = add_deck_card!(deck, "Partner Two", 1, "mainboard")
    assert {:error, :command_zone_full} = Catalog.add_deck_partner(third)
  end

  test "archived decks reject decklist edits until unarchived" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Archived Edit Guard"})
    assert {:ok, lotus} = Catalog.add_card_to_deck(deck, %{"name" => "Black Lotus"})
    assert {:ok, archived_deck} = Catalog.update_deck(deck, %{"status" => "archived"})

    assert {:error, :deck_archived} =
             Catalog.add_card_to_deck(archived_deck, %{"name" => "Time Walk"})

    assert {:error, :deck_archived} = Catalog.import_decklist(archived_deck, "1 Time Walk")
    assert {:error, :deck_archived} = Catalog.update_deck_card(lotus, %{"quantity" => 2})
    assert {:error, :deck_archived} = Catalog.delete_deck_card(lotus)

    assert {:ok, active_deck} = Catalog.update_deck(archived_deck, %{"status" => "active"})
    assert {:ok, %DeckCard{quantity: 2}} = Catalog.update_deck_card(lotus, %{"quantity" => 2})
    assert {:ok, %DeckCard{}} = Catalog.add_card_to_deck(active_deck, %{"name" => "Time Walk"})
  end

  test "deck stats total excludes considering-zone cards" do
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

    assert {:ok, _considering_lotus} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Black Lotus",
               "quantity" => 4,
               "zone" => "considering"
             })

    assert {:ok, _considering_walk} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Time Walk",
               "quantity" => 8,
               "zone" => "considering"
             })

    stats = deck.id |> Catalog.get_deck!() |> Catalog.deck_stats()

    assert stats.total == 3

    assert stats.zones == %{
             "commander" => 1,
             "mainboard" => 2,
             "considering" => 12
           }
  end
end
