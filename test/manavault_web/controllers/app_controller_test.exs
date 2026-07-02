defmodule ManavaultWeb.AppControllerTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Catalog
  alias Manavault.CatalogTestSupport

  test "GET / serves the React mount", %{conn: conn} do
    conn = get(conn, ~p"/")

    assert html_response(conn, 200) =~ ~s(id="manavault-root")
  end

  test "GET /collection/locations/:id serves the React mount", %{conn: conn} do
    conn = get(conn, "/collection/locations/1")

    assert html_response(conn, 200) =~ ~s(id="manavault-root")
  end

  test "GET /share/decks/:token includes deck-specific link preview metadata", %{conn: conn} do
    token = shared_deck_token()

    conn = get(conn, "/share/decks/#{token}")
    response = html_response(conn, 200)

    assert response =~ ~s(<title>Lotus Lessons · ManaVault</title>)
    assert response =~ ~s|property="og:title" content="Lotus Lessons · ManaVault"|

    assert response =~
             ~s|property="og:description" content="Commander deck, 100 cards, Legal, $256.76."|

    refute response =~ "unique"

    assert response =~
             ~s|property="og:image" content="http://www.example.com/share/decks/#{token}/preview.png"|

    assert response =~ ~s|property="og:image:type" content="image/png"|
    assert response =~ ~s|property="og:image:width" content="1200"|
    assert response =~ ~s|property="og:image:height" content="630"|
    assert response =~ ~s|name="twitter:card" content="summary_large_image"|
    assert response =~ ~s(id="manavault-root")
  end

  test "GET /share/decks/:token/preview.svg renders the deck header preview", %{conn: conn} do
    token = shared_deck_token()

    conn = get(conn, "/share/decks/#{token}/preview.svg")
    response = response(conn, 200)

    assert get_resp_header(conn, "content-type") == ["image/svg+xml; charset=utf-8"]
    assert response =~ ~s(<svg)
    assert response =~ "Lotus Lessons"
    assert response =~ "Commander"
    assert response =~ "100 cards"
    refute response =~ "unique"
    assert response =~ "Legal"
    assert response =~ "$256.76"
    assert response =~ "data:image/svg+xml"
    assert response =~ ~s(<clipPath id="cardClip">)
    assert response =~ ~s|clip-path="url(#cardClip)"|
    assert response =~ ~s|href="/scryfall-assets/symbols/W.svg"|
    assert response =~ ~s(font-size="22" font-weight="750">Commander</text>)
    refute response =~ ~s(fill="#10141a")
    refute response =~ ~s(· · ·)
  end

  test "GET /share/decks/:token/preview.png renders a social preview PNG", %{conn: conn} do
    token = shared_deck_token()

    conn = get(conn, "/share/decks/#{token}/preview.png")
    response = response(conn, 200)

    assert get_resp_header(conn, "content-type") == ["image/png"]
    assert <<137, 80, 78, 71, 13, 10, 26, 10, _rest::binary>> = response
  end

  test "GET / uses built React assets for non-local dev hosts", %{conn: conn} do
    previous = Application.get_env(:manavault, :vite_dev_server?)
    Application.put_env(:manavault, :vite_dev_server?, true)

    on_exit(fn ->
      if is_nil(previous) do
        Application.delete_env(:manavault, :vite_dev_server?)
      else
        Application.put_env(:manavault, :vite_dev_server?, previous)
      end
    end)

    conn =
      conn
      |> Map.put(:host, "manavault.example.com")
      |> get(~p"/")

    response = html_response(conn, 200)

    # The ESM entry must stay at the canonical unversioned URL Vite chunks use
    # when importing ../app.js — a query string creates a second module
    # instance and remounts React (see AppController.react_scripts).
    assert response =~ ~s(src="/assets/react/app.js")
    refute response =~ ~r(src="/assets/react/app\.js\?)
    refute response =~ "127.0.0.1:5173"
  end

  defp shared_deck_token do
    {:ok, %{cards_count: 2, printings_count: 2}} =
      Catalog.import_cards([
        Map.merge(CatalogTestSupport.legal_commander_card(), %{
          "id" => "scryfall-preview-commander",
          "oracle_id" => "oracle-preview-commander",
          "name" => "Lotus Tutor",
          "image_uris" => %{"art_crop" => preview_cover_data_uri()},
          "prices" => %{"usd" => "256.76"}
        }),
        Map.merge(CatalogTestSupport.legal_plains(), %{
          "id" => "scryfall-preview-plains",
          "oracle_id" => "oracle-preview-plains",
          "prices" => %{}
        })
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Lotus Lessons", "status" => "active"})

    {:ok, _commander} =
      Catalog.add_card_to_deck(deck, %{
        "name" => "Lotus Tutor",
        "preferred_printing_id" => "scryfall-preview-commander",
        "quantity" => 1,
        "zone" => "commander"
      })

    {:ok, _plains} =
      Catalog.add_card_to_deck(deck, %{
        "name" => "Plains",
        "preferred_printing_id" => "scryfall-preview-plains",
        "quantity" => 99,
        "zone" => "mainboard"
      })

    {:ok, deck} = Catalog.ensure_deck_share_token(deck)

    deck.share_token
  end

  defp preview_cover_data_uri do
    svg =
      ~s(<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#31203a" /><circle cx="980" cy="120" r="220" fill="#f59e0b" opacity="0.7" /></svg>)

    "data:image/svg+xml;utf8," <> URI.encode(svg)
  end
end
