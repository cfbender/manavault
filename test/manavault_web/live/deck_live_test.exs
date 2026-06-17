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
    assert html =~ "LEA #232"
    assert html =~ "Nonfoil"
    assert html =~ "Commander"
    assert html =~ "Mainboard"
  end
end
