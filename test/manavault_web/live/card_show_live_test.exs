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

  test "shows all known printings with details and image", %{conn: conn} do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus_alpha, @black_lotus_beta])

    {:ok, _view, html} = live(conn, ~p"/cards/oracle-1")

    assert html =~ "Black Lotus"
    assert html =~ "https://example.test/black-lotus-art.jpg"
    assert html =~ "Oracle text"
    assert html =~ "Rules text"
    assert html =~ "{T}, Sacrifice Black Lotus: Add three mana of any one color."
    assert html =~ "Known printings"
    assert html =~ "Limited Edition Alpha (LEA)"
    assert html =~ "Limited Edition Beta (LEB)"
    assert html =~ "232"
    assert html =~ "233"
    assert html =~ "en"
    assert html =~ "ja"
    assert html =~ "nonfoil, foil"
    assert html =~ "https://example.test/black-lotus.jpg"
  end
end
