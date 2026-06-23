defmodule Manavault.Catalog.DeckLegalityTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures

  alias Manavault.Catalog

  alias Manavault.Catalog.{
    Card,
    DeckCard
  }

  test "deck legality accepts legal commander deck with repeated basic lands" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([legal_commander_card(), legal_plains()])

    assert {:ok, deck} =
             Catalog.create_deck(%{
               "name" => "Legal Commander",
               "format" => "commander"
             })

    add_deck_card!(deck, "Test Commander", 1, "commander")
    add_deck_card!(deck, "Plains", 99, "mainboard")

    assert %{status: "legal", issues: []} = Catalog.deck_legality(deck)

    assert %{status: "legal", issues: []} =
             deck.id |> Catalog.get_deck!() |> Catalog.deck_legality()
  end

  test "deck legality uses already preloaded deck cards" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([legal_commander_card(), legal_plains()])

    assert {:ok, deck} =
             Catalog.create_deck(%{
               "name" => "Preloaded Commander",
               "format" => "commander"
             })

    add_deck_card!(deck, "Test Commander", 1, "commander")
    add_deck_card!(deck, "Plains", 99, "mainboard")

    preloaded_deck = Catalog.get_deck!(deck.id)

    deck_cards =
      Enum.map(preloaded_deck.deck_cards, fn
        %DeckCard{card: %Card{name: "Plains"} = card} = deck_card ->
          %{deck_card | card: %{card | legalities: %{"commander" => "banned"}}}

        deck_card ->
          deck_card
      end)

    legality = Catalog.deck_legality(%{preloaded_deck | deck_cards: deck_cards})

    assert legality.status == "illegal"
    assert issue_by_code(legality, "card_legality").card_name == "Plains"
  end

  test "deck legality rejects duplicate non-basic commander cards" do
    duplicate = legality_card("Silver Bolt", ["W"], %{"commander" => "legal"})

    assert {:ok, %{cards_count: 3, printings_count: 3}} =
             Catalog.import_cards([legal_commander_card(), legal_plains(), duplicate])

    assert {:ok, deck} =
             Catalog.create_deck(%{
               "name" => "Duplicate Commander",
               "format" => "commander"
             })

    add_deck_card!(deck, "Test Commander", 1, "commander")
    add_deck_card!(deck, "Plains", 97, "mainboard")
    add_deck_card!(deck, "Silver Bolt", 2, "mainboard")

    legality = deck.id |> Catalog.get_deck!() |> Catalog.deck_legality()

    assert legality.status == "illegal"
    assert Enum.map(legality.issues, & &1.code) == ["commander_singleton"]

    issue = issue_by_code(legality, "commander_singleton")
    assert issue.card_name == "Silver Bolt"
    assert issue.message =~ "Silver Bolt appears 2 times"
  end

  test "deck legality rejects commander cards banned by Scryfall legality" do
    banned = legality_card("Banned Spell", [], %{"commander" => "banned"})

    assert {:ok, %{cards_count: 3, printings_count: 3}} =
             Catalog.import_cards([legal_commander_card(), legal_plains(), banned])

    assert {:ok, deck} =
             Catalog.create_deck(%{
               "name" => "Banned Commander",
               "format" => "commander"
             })

    add_deck_card!(deck, "Test Commander", 1, "commander")
    add_deck_card!(deck, "Plains", 98, "mainboard")
    add_deck_card!(deck, "Banned Spell", 1, "mainboard")

    legality = deck.id |> Catalog.get_deck!() |> Catalog.deck_legality()

    assert legality.status == "illegal"
    assert Enum.map(legality.issues, & &1.code) == ["card_legality"]

    issue = issue_by_code(legality, "card_legality")
    assert issue.card_name == "Banned Spell"
    assert issue.message =~ "Banned Spell"
    assert issue.message =~ "commander"
    assert issue.message =~ "banned"
  end

  test "deck legality rejects commander cards outside commander color identity" do
    off_color = legality_card("Blue Spell", ["U"], %{"commander" => "legal"})

    assert {:ok, %{cards_count: 3, printings_count: 3}} =
             Catalog.import_cards([legal_commander_card(), legal_plains(), off_color])

    assert {:ok, deck} =
             Catalog.create_deck(%{
               "name" => "Off Color Commander",
               "format" => "commander"
             })

    add_deck_card!(deck, "Test Commander", 1, "commander")
    add_deck_card!(deck, "Plains", 98, "mainboard")
    add_deck_card!(deck, "Blue Spell", 1, "mainboard")

    legality = deck.id |> Catalog.get_deck!() |> Catalog.deck_legality()

    assert legality.status == "illegal"
    assert Enum.map(legality.issues, & &1.code) == ["commander_color_identity"]

    issue = issue_by_code(legality, "commander_color_identity")
    assert issue.card_name == "Blue Spell"
    assert issue.message =~ "Blue Spell color identity U"
    assert issue.message =~ "commander color identity W"
  end
end
