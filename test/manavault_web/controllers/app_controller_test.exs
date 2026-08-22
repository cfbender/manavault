defmodule ManavaultWeb.AppControllerTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Catalog
  alias Manavault.CatalogTestSupport
  alias Manavault.Trade

  test "GET / serves the React mount", %{conn: conn} do
    conn = get(conn, ~p"/")
    response = html_response(conn, 200)

    assert response =~ ~s(id="manavault-root")
    assert response =~ ~s(data-theme-style="glass")
    assert response =~ ~s(<html lang="en" class="h-screen w-screen overflow-hidden")
    assert response =~ ~s(<body class="h-screen w-screen overflow-hidden">)
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
    assert response =~ ~s(data-theme-style="glass")
  end

  test "share shells reject revoked and malformed tokens for every share kind", %{conn: conn} do
    deck_token = shared_deck_token()
    deck = Catalog.get_deck_by_share_token(deck_token)
    assert {:ok, _deck} = Catalog.disable_deck_sharing(deck)

    assert {:ok, wants_token} = Trade.ensure_wants_share_token()
    assert {:ok, _} = Trade.disable_wants_sharing()
    assert {:ok, binder_token} = Trade.ensure_binder_share_token()
    assert {:ok, _} = Trade.disable_binder_sharing()

    for path <- [
          "/share/decks/#{deck_token}",
          "/share/wants/#{wants_token}",
          "/share/binder/#{binder_token}",
          "/share/decks/malformed",
          "/share/wants/malformed",
          "/share/binder/malformed"
        ] do
      assert response(get(recycle(conn), path), 404) == ""
    end
  end

  test "valid wants and binder tokens serve the app shell", %{conn: conn} do
    assert {:ok, wants_token} = Trade.ensure_wants_share_token()
    assert {:ok, binder_token} = Trade.ensure_binder_share_token()

    wants_response = html_response(get(recycle(conn), "/share/wants/#{wants_token}"), 200)
    binder_response = html_response(get(recycle(conn), "/share/binder/#{binder_token}"), 200)

    for response <- [wants_response, binder_response] do
      assert response =~ "manavault-root"
      assert response =~ ~s(data-theme-style="glass")
    end
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

  test "GET /share/decks/:token/preview.svg renders the saved bracket", %{conn: conn} do
    token = shared_deck_token()
    deck = Catalog.get_deck_by_share_token(token)

    assert {:ok, _deck} =
             Catalog.save_deck_analysis(deck, %{
               ai_analysis: "## Bracket read\n\nA slow deck with one Game Changer.",
               ai_analysis_model: "test/model",
               ai_analyzed_at: DateTime.utc_now(),
               commander_bracket: 3,
               commander_bracket_estimate: 2
             })

    response = conn |> get("/share/decks/#{token}/preview.svg") |> response(200)

    assert response =~ "Bracket 3 · Pace 2"
  end

  test "GET /share/decks/:token/preview.png renders a social preview PNG", %{conn: conn} do
    token = shared_deck_token()

    conn =
      Oban.Testing.with_testing_mode(:inline, fn ->
        get(conn, "/share/decks/#{token}/preview.png")
      end)

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

  test "GET / uses same-origin Vite assets behind the development proxy", %{conn: conn} do
    previous = Application.get_env(:manavault, :vite_dev_server?)
    Application.put_env(:manavault, :vite_dev_server?, true)

    on_exit(fn ->
      if is_nil(previous) do
        Application.delete_env(:manavault, :vite_dev_server?)
      else
        Application.put_env(:manavault, :vite_dev_server?, previous)
      end
    end)

    response =
      conn
      |> Map.put(:host, "review.onamp.dev")
      |> put_req_header("x-manavault-vite-proxy", "1")
      |> get(~p"/")
      |> html_response(200)

    assert response =~ ~s(import RefreshRuntime from "/@react-refresh")
    assert response =~ ~s(src="/@vite/client")
    assert response =~ ~s(src="/assets/react/src/main.tsx")
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
