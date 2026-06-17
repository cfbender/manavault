defmodule ManavaultWeb.DeckLiveTest do
  use ManavaultWeb.ConnCase

  import Phoenix.LiveViewTest

  alias Manavault.Catalog

  @black_lotus %{
    "id" => "scryfall-printing-1",
    "oracle_id" => "oracle-1",
    "name" => "Black Lotus",
    "type_line" => "Artifact",
    "oracle_text" => "{T}, Sacrifice Black Lotus: Add three mana of any one color.",
    "color_identity" => [],
    "legalities" => %{"vintage" => "restricted"},
    "set" => "lea",
    "set_name" => "Limited Edition Alpha",
    "collector_number" => "232",
    "lang" => "en",
    "finishes" => ["nonfoil"],
    "image_uris" => %{"normal" => "https://example.test/black-lotus.jpg"},
    "released_at" => "1993-08-05"
  }

  @time_walk %{
    "id" => "scryfall-printing-2",
    "oracle_id" => "oracle-2",
    "name" => "Time Walk",
    "type_line" => "Sorcery",
    "color_identity" => ["U"],
    "set" => "lea",
    "set_name" => "Limited Edition Alpha",
    "collector_number" => "84",
    "lang" => "en",
    "finishes" => ["nonfoil"],
    "image_uris" => %{
      "art_crop" => "https://example.test/time-walk-art.jpg",
      "normal" => "https://example.test/time-walk.jpg"
    },
    "released_at" => "1993-08-05"
  }

  setup do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    :ok
  end

  test "creates a deck and adds cards by identity", %{conn: conn} do
    {:ok, view, html} = live(conn, ~p"/decks")

    assert html =~ "Create deck"

    view
    |> form("#deck-form", deck: %{name: "Powered", format: "vintage", status: "brewing"})
    |> render_submit()

    assert_redirected(view, ~p"/decks/1")

    {:ok, show, html} = live(conn, ~p"/decks/1")
    assert html =~ "Powered"
    assert html =~ "0 cards"

    show
    |> form("#add-card-form", deck_card: %{name: "Black Lotus", quantity: "1", zone: "mainboard"})
    |> render_submit()

    html = render(show)
    assert html =~ "Black Lotus"
    assert html =~ "Mainboard"
    assert html =~ "1 cards"

    show
    |> form("#deck-settings-form",
      deck: %{name: "Powered Updated", format: "commander", status: "active"}
    )
    |> render_submit()

    html = render(show)
    assert html =~ "Powered Updated"
    assert html =~ "Commander · Active"
  end

  test "imports a plain text decklist with zones", %{conn: conn} do
    {:ok, deck} = Catalog.create_deck(%{"name" => "Importable"})

    {:ok, view, _html} = live(conn, ~p"/decks/#{deck.id}")

    view
    |> form("#import-decklist-form",
      import: %{
        decklist: """
        Commander
        1 Time Walk

        Mainboard
        1 Black Lotus (LEA) 232
        """
      }
    )
    |> render_submit()

    html = render(view)
    assert html =~ "Time Walk"
    assert html =~ "Black Lotus"
    assert html =~ "LEA"
    assert html =~ "Nonfoil"
    assert html =~ "Commander"
    assert html =~ "Mainboard"
  end

  test "shows cards moved to maybeboard in the board table", %{conn: conn} do
    {:ok, deck} = Catalog.create_deck(%{"name" => "Boards"})
    {:ok, deck_card} = Catalog.add_card_to_deck(deck, %{"name" => "Black Lotus"})
    {:ok, _mainboard_card} = Catalog.add_card_to_deck(deck, %{"name" => "Time Walk"})

    {:ok, view, _html} = live(conn, ~p"/decks/#{deck.id}")

    view
    |> form("#deck-card-#{deck_card.id}-edit-form",
      deck_card: %{quantity: "1", zone: "maybeboard"}
    )
    |> render_submit()

    html = render(view)
    assert html =~ "1 cards across"
    assert html =~ "Maybeboard"
    assert html =~ "Black Lotus"
    assert html =~ "LEA"
    refute has_element?(view, "#deck-board-zone-mainboard")
    assert has_element?(view, "#deck-board-zone-maybeboard")

    view
    |> form("#deck-card-#{deck_card.id}-board-zone-form",
      deck_card: %{quantity: "1", zone: "mainboard"}
    )
    |> render_change()

    refute has_element?(view, "#deck-card-#{deck_card.id}-board-zone-form")
  end

  test "includes commander cards in the deck view for commander decks", %{conn: conn} do
    {:ok, deck} = Catalog.create_deck(%{"name" => "Commander Boards", "format" => "commander"})
    {:ok, _mainboard_card} = Catalog.add_card_to_deck(deck, %{"name" => "Black Lotus"})

    {:ok, _commander_card} =
      Catalog.add_card_to_deck(deck, %{"name" => "Time Walk", "zone" => "commander"})

    {:ok, view, html} = live(conn, ~p"/decks/#{deck.id}")

    assert html =~ "2 cards across"
    assert html =~ "Time Walk"
    refute has_element?(view, "#deck-board-zone-mainboard")
    refute has_element?(view, "#deck-board-zone-commander")
    assert has_element?(view, ~s|#add-card-form option[value="commander"]|)
  end

  test "shows deck index cards with commander art and color identity", %{conn: conn} do
    {:ok, deck} = Catalog.create_deck(%{"name" => "Turns", "format" => "commander"})

    {:ok, _commander_card} =
      Catalog.add_card_to_deck(deck, %{"name" => "Time Walk", "zone" => "commander"})

    {:ok, view, html} = live(conn, ~p"/decks")

    assert html =~ "Turns"

    assert has_element?(
             view,
             ~s|#deck-row-#{deck.id}[data-deck-cover-image="https://example.test/time-walk-art.jpg"]|
           )

    assert has_element?(view, ~s|#deck-row-#{deck.id} [data-symbol="{U}"]|)
  end

  test "hides commander zone controls outside commander format", %{conn: conn} do
    {:ok, deck} = Catalog.create_deck(%{"name" => "Modern Boards", "format" => "modern"})

    {:ok, sideboard_card} =
      Catalog.add_card_to_deck(deck, %{"name" => "Black Lotus", "zone" => "sideboard"})

    {:ok, view, _html} = live(conn, ~p"/decks/#{deck.id}")

    refute has_element?(view, "#deck-board-zone-commander")
    refute has_element?(view, ~s|#add-card-form option[value="commander"]|)

    refute has_element?(
             view,
             ~s|#deck-card-#{sideboard_card.id}-board-zone-form option[value="commander"]|
           )
  end
end
