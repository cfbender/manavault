defmodule ManavaultWeb.CardSearchLiveTest do
  use ManavaultWeb.ConnCase

  import Phoenix.LiveViewTest

  alias Manavault.Catalog

  @black_lotus %{
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
    "released_at" => "1993-08-05",
    "image_uris" => %{"normal" => "https://example.test/black-lotus.jpg"}
  }

  @split_card %{
    "id" => "scryfall-printing-2",
    "oracle_id" => "oracle-2",
    "name" => "Oracle's Test // Oracle's Answer",
    "type_line" => "Instant // Sorcery",
    "set" => "tst",
    "set_name" => "Test Set",
    "collector_number" => "1",
    "lang" => "en",
    "finishes" => ["nonfoil"],
    "released_at" => "2024-01-01",
    "card_faces" => [
      %{
        "name" => "Oracle's Test",
        "oracle_text" => "Test text.",
        "image_uris" => %{"normal" => "https://example.test/split-front.jpg"}
      },
      %{
        "name" => "Oracle's Answer",
        "oracle_text" => "Answer text.",
        "image_uris" => %{"normal" => "https://example.test/split-back.jpg"}
      }
    ]
  }

  setup do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @split_card])

    :ok
  end

  test "search submit patches URL and restored URL renders results", %{conn: conn} do
    {:ok, view, html} = live(conn, ~p"/cards")

    assert html =~ "Find cards"

    view
    |> form("form[phx-submit=search_cards]", search: %{q: "lotus"})
    |> render_submit()

    assert_patch(view, ~p"/cards?q=lotus")

    html = render(view)
    assert html =~ "Black Lotus"
    assert html =~ ~s|/cards/oracle-1?q=lotus|
    assert html =~ "https://example.test/black-lotus.jpg"
  end

  test "card name input shows fuzzy autocomplete suggestions", %{conn: conn} do
    {:ok, view, _html} = live(conn, ~p"/cards")

    html =
      view
      |> element("#search_q")
      |> render_keyup(%{"value" => "blak lotu"})

    assert html =~ "Black Lotus"
  end

  test "loads search state and results from query params", %{conn: conn} do
    {:ok, view, html} = live(conn, ~p"/cards?q=lotus")

    assert html =~ ~s|value="lotus"|
    assert html =~ "Black Lotus"
    assert html =~ ~s|/cards/oracle-1?q=lotus|
    refute has_element?(view, "[data-card-name-suggestions]")
  end

  test "empty search patches back to plain cards URL", %{conn: conn} do
    {:ok, view, _html} = live(conn, ~p"/cards?q=lotus")

    view
    |> form("form[phx-submit=search_cards]", search: %{q: " "})
    |> render_submit()

    assert_patch(view, ~p"/cards")
  end

  test "shows split card search results with face images", %{conn: conn} do
    {:ok, view, _html} = live(conn, ~p"/cards")

    view
    |> form("form[phx-submit=search_cards]", search: %{q: "oracle"})
    |> render_submit()

    assert_patch(view, ~p"/cards?q=oracle")

    html = render(view)
    assert html =~ "Oracle&#39;s Test // Oracle&#39;s Answer"
    assert html =~ ~s|/cards/oracle-2?q=oracle|
    assert html =~ "https://example.test/split-front.jpg"
  end
end
