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

  test "deck legality accepts two commanders that both have Partner" do
    assert {:ok, _imported} =
             Catalog.import_cards([
               partner_commander("Partner One", ["W"]),
               partner_commander("Partner Two", ["U"]),
               legal_plains()
             ])

    deck = commander_deck!("Partner Deck")

    add_deck_card!(deck, "Partner One", 1, "commander")
    add_deck_card!(deck, "Partner Two", 1, "commander")
    add_deck_card!(deck, "Plains", 98, "mainboard")

    assert %{status: "legal", issues: []} =
             deck.id |> Catalog.get_deck!() |> Catalog.deck_legality()
  end

  test "deck legality rejects two commanders without a pairing ability" do
    assert {:ok, _imported} =
             Catalog.import_cards([
               legality_commander_card("Lone General", ["W"]),
               legality_commander_card("Other General", ["W"]),
               legal_plains()
             ])

    deck = commander_deck!("Unpaired Commanders")

    add_deck_card!(deck, "Lone General", 1, "commander")
    add_deck_card!(deck, "Other General", 1, "commander")
    add_deck_card!(deck, "Plains", 98, "mainboard")

    legality = deck.id |> Catalog.get_deck!() |> Catalog.deck_legality()

    assert legality.status == "illegal"
    assert Enum.map(legality.issues, & &1.code) == ["commander_count"]
    assert issue_by_code(legality, "commander_count").message =~ "can't be paired"
  end

  test "deck legality requires restricted Partner labels to match" do
    assert {:ok, _imported} =
             Catalog.import_cards([
               restricted_partner_commander("Survivor Leader", ["W"], "Survivors"),
               restricted_partner_commander("Vault Dweller", ["W"], "Vault 13"),
               restricted_partner_commander("Survivor Scout", ["W"], "Survivors"),
               legal_plains()
             ])

    matched_deck = commander_deck!("Matched Restricted Partners")
    add_deck_card!(matched_deck, "Survivor Leader", 1, "commander")
    add_deck_card!(matched_deck, "Survivor Scout", 1, "commander")
    add_deck_card!(matched_deck, "Plains", 98, "mainboard")

    assert %{status: "legal", issues: []} =
             matched_deck.id |> Catalog.get_deck!() |> Catalog.deck_legality()

    mismatched_deck = commander_deck!("Mismatched Restricted Partners")
    add_deck_card!(mismatched_deck, "Survivor Leader", 1, "commander")
    add_deck_card!(mismatched_deck, "Vault Dweller", 1, "commander")
    add_deck_card!(mismatched_deck, "Plains", 98, "mainboard")

    legality = mismatched_deck.id |> Catalog.get_deck!() |> Catalog.deck_legality()

    assert legality.status == "illegal"
    assert Enum.map(legality.issues, & &1.code) == ["commander_count"]
  end

  test "deck legality accepts commanders that Partner with each other" do
    assert {:ok, _imported} =
             Catalog.import_cards([
               legality_commander_card("Named Ally", ["W"], %{
                 "oracle_text" =>
                   "Partner with Named Friend (When this creature enters, target player may put Named Friend into their hand from their library, then shuffle.)"
               }),
               legality_commander_card("Named Friend", ["U"], %{
                 "oracle_text" =>
                   "Partner with Named Ally (When this creature enters, target player may put Named Ally into their hand from their library, then shuffle.)"
               }),
               legality_commander_card("Named Stranger", ["U"]),
               legal_plains()
             ])

    deck = commander_deck!("Partner With Deck")
    add_deck_card!(deck, "Named Ally", 1, "commander")
    add_deck_card!(deck, "Named Friend", 1, "commander")
    add_deck_card!(deck, "Plains", 98, "mainboard")

    assert %{status: "legal", issues: []} =
             deck.id |> Catalog.get_deck!() |> Catalog.deck_legality()

    one_sided_deck = commander_deck!("One Sided Partner With Deck")
    add_deck_card!(one_sided_deck, "Named Ally", 1, "commander")
    add_deck_card!(one_sided_deck, "Named Stranger", 1, "commander")
    add_deck_card!(one_sided_deck, "Plains", 98, "mainboard")

    legality = one_sided_deck.id |> Catalog.get_deck!() |> Catalog.deck_legality()

    assert legality.status == "illegal"
    assert Enum.map(legality.issues, & &1.code) == ["commander_count"]
  end

  test "deck legality accepts two Friends forever commanders" do
    friends_forever = %{
      "oracle_text" =>
        "Friends forever (You can have two commanders if both have friends forever.)"
    }

    assert {:ok, _imported} =
             Catalog.import_cards([
               legality_commander_card("Best Friend", ["W"], friends_forever),
               legality_commander_card("Forever Friend", ["U"], friends_forever),
               legal_plains()
             ])

    deck = commander_deck!("Friends Forever Deck")
    add_deck_card!(deck, "Best Friend", 1, "commander")
    add_deck_card!(deck, "Forever Friend", 1, "commander")
    add_deck_card!(deck, "Plains", 98, "mainboard")

    assert %{status: "legal", issues: []} =
             deck.id |> Catalog.get_deck!() |> Catalog.deck_legality()
  end

  test "deck legality accepts a Choose a Background commander with a Background" do
    assert {:ok, _imported} =
             Catalog.import_cards([
               legality_commander_card("Background Chooser", ["W"], %{
                 "oracle_text" =>
                   "Choose a Background (You can have a Background as a second commander.)"
               }),
               legality_card("Storied Past", ["U"], %{"commander" => "legal"}, %{
                 "type_line" => "Legendary Enchantment — Background"
               }),
               legal_plains()
             ])

    deck = commander_deck!("Background Deck")
    add_deck_card!(deck, "Background Chooser", 1, "commander")
    add_deck_card!(deck, "Storied Past", 1, "commander")
    add_deck_card!(deck, "Plains", 98, "mainboard")

    assert %{status: "legal", issues: []} =
             deck.id |> Catalog.get_deck!() |> Catalog.deck_legality()
  end

  test "deck legality allows one chosen color for a Doctor's companion that chooses a color" do
    assert {:ok, _imported} = Catalog.import_cards(doctor_pairing_cards())

    deck = commander_deck!("Doctor Deck")
    add_deck_card!(deck, "Test Doctor", 1, "commander")
    add_deck_card!(deck, "Test Companion", 1, "commander")
    add_deck_card!(deck, "Test Island", 97, "mainboard")
    add_deck_card!(deck, "Green Spell", 1, "mainboard")

    assert %{status: "legal", issues: []} =
             deck.id |> Catalog.get_deck!() |> Catalog.deck_legality()
  end

  test "deck legality rejects a card needing more chosen colors than the commanders provide" do
    assert {:ok, _imported} = Catalog.import_cards(doctor_pairing_cards())

    deck = commander_deck!("Doctor Two Color Deck")
    add_deck_card!(deck, "Test Doctor", 1, "commander")
    add_deck_card!(deck, "Test Companion", 1, "commander")
    add_deck_card!(deck, "Test Island", 97, "mainboard")
    add_deck_card!(deck, "Two Color Spell", 1, "mainboard")

    legality = deck.id |> Catalog.get_deck!() |> Catalog.deck_legality()

    assert legality.status == "illegal"
    assert Enum.map(legality.issues, & &1.code) == ["commander_color_identity"]

    issue = issue_by_code(legality, "commander_color_identity")
    assert issue.card_name == "Two Color Spell"
    assert issue.message =~ "1 chosen color"
  end

  test "deck legality rejects decks whose combined extra colors exceed the chooseable colors" do
    assert {:ok, _imported} = Catalog.import_cards(doctor_pairing_cards())

    deck = commander_deck!("Doctor Combined Colors Deck")
    add_deck_card!(deck, "Test Doctor", 1, "commander")
    add_deck_card!(deck, "Test Companion", 1, "commander")
    add_deck_card!(deck, "Test Island", 96, "mainboard")
    add_deck_card!(deck, "Green Spell", 1, "mainboard")
    add_deck_card!(deck, "White Spell", 1, "mainboard")

    legality = deck.id |> Catalog.get_deck!() |> Catalog.deck_legality()

    assert legality.status == "illegal"
    assert Enum.map(legality.issues, & &1.code) == ["commander_color_identity"]

    issue = issue_by_code(legality, "commander_color_identity")
    assert issue.card_name == nil
    assert issue.message =~ "use GW"
    assert issue.message =~ "1 chosen color"
  end

  defp commander_deck!(name) do
    assert {:ok, deck} = Catalog.create_deck(%{"name" => name, "format" => "commander"})
    deck
  end

  defp partner_commander(name, colors) do
    legality_commander_card(name, colors, %{
      "oracle_text" => "Partner (You can have two commanders if both have partner.)"
    })
  end

  defp restricted_partner_commander(name, colors, label) do
    legality_commander_card(name, colors, %{
      "oracle_text" =>
        "Partner—#{label} (You can have two commanders if both have a #{label} partner ability.)"
    })
  end

  defp doctor_pairing_cards do
    [
      legality_commander_card("Test Doctor", ["U", "R"], %{
        "type_line" => "Legendary Creature — Time Lord Doctor"
      }),
      legality_commander_card("Test Companion", [], %{
        "oracle_text" =>
          "If Test Companion is your commander, choose a color before the game begins. Test Companion is the chosen color.\nDoctor's companion (You can have two commanders if the other is the Doctor.)"
      }),
      legality_card("Test Island", ["U"], %{"commander" => "legal"}, %{
        "type_line" => "Basic Land — Island"
      }),
      legality_card("Green Spell", ["G"], %{"commander" => "legal"}),
      legality_card("White Spell", ["W"], %{"commander" => "legal"}),
      legality_card("Two Color Spell", ["G", "W"], %{"commander" => "legal"})
    ]
  end
end
