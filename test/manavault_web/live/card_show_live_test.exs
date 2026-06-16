defmodule ManavaultWeb.CardShowLiveTest do
  use ManavaultWeb.ConnCase

  import Phoenix.LiveViewTest

  alias Manavault.Catalog

  @black_lotus_alpha %{
    "id" => "scryfall-printing-1",
    "oracle_id" => "oracle-1",
    "name" => "Black Lotus",
    "type_line" => "Artifact",
    "oracle_text" => "{T}, Sacrifice Black Lotus: Add three mana of any one color.",
    "set" => "lea",
    "set_name" => "Limited Edition Alpha",
    "collector_number" => "232",
    "lang" => "en",
    "finishes" => ["nonfoil"],
    "image_uris" => %{"normal" => "https://example.test/black-lotus.jpg"},
    "prices" => %{"usd" => "100000.00"},
    "released_at" => "1993-08-05"
  }

  @black_lotus_beta %{
    @black_lotus_alpha
    | "id" => "scryfall-printing-2",
      "set" => "leb",
      "set_name" => "Limited Edition Beta",
      "collector_number" => "233",
      "lang" => "ja",
      "finishes" => ["nonfoil", "foil"],
      "image_uris" => %{
        "normal" => "https://example.test/black-lotus-beta.jpg",
        "art_crop" => "https://example.test/black-lotus-art.jpg"
      },
      "released_at" => "1993-10-04"
  }

  test "renders card hero, oracle text, and printing thumbnails", %{conn: conn} do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus_alpha, @black_lotus_beta])

    {:ok, _view, html} = live(conn, ~p"/cards/oracle-1?q=lotus")

    # Hero / oracle text
    assert html =~ ~s|href="/cards?q=lotus"|
    assert html =~ "Back to search"
    assert html =~ "Black Lotus"
    assert html =~ "https://example.test/black-lotus-art.jpg"
    assert html =~ "Oracle text"
    assert html =~ "{T}, Sacrifice Black Lotus: Add three mana of any one color."

    # Printing thumbnails — set code badge on images
    assert html =~ "LEA"
    assert html =~ "LEB"

    # Price badge visible
    assert html =~ "$100000"

    # Image URLs on thumbnails
    assert html =~ "https://example.test/black-lotus.jpg"
    assert html =~ "https://example.test/black-lotus-beta.jpg"

    # Add buttons with correct links
    assert html =~ "/collection/new?printing_id=scryfall-printing-1"
    assert html =~ "/collection/new?printing_id=scryfall-printing-2"
    assert html =~ "+ Add"

    # Full set labels / metadata NOT visible on initial render (in modal)
    refute html =~ "Limited Edition Alpha"
    refute html =~ "Limited Edition Beta"
    refute html =~ "Scryfall ID"
  end

  test "clicking a printing opens modal with full metadata", %{conn: conn} do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus_alpha, @black_lotus_beta])

    {:ok, view, _html} = live(conn, ~p"/cards/oracle-1")

    # Click the first printing image
    html =
      view
      |> element(~s|[phx-click="show_details"][phx-value-scryfall_id="scryfall-printing-2"]|)
      |> render_click()

    # Modal now visible with metadata
    assert html =~ "Scryfall ID"
    assert html =~ "scryfall-printing-2"
    assert html =~ "233"
    assert html =~ "ja"
    assert html =~ "nonfoil, foil"
    assert html =~ "Limited Edition Beta (LEB)"

    # Close the modal
    html =
      view
      |> element("button", "Close")
      |> render_click()

    refute html =~ "Scryfall ID"
  end
end
