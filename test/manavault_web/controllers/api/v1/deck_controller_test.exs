defmodule ManavaultWeb.Api.V1.DeckControllerTest do
  use ManavaultWeb.ConnCase
  use Manavault.CatalogTestFixtures

  alias Manavault.Auth.ApiKeys
  alias Manavault.Catalog
  alias Manavault.PublicShareRequestLimiter

  setup do
    previous_rate_limit = Application.get_env(:manavault, :public_share_rate_limit)
    PublicShareRequestLimiter.reset()

    on_exit(fn ->
      Application.put_env(:manavault, :public_share_rate_limit, previous_rate_limit)
      PublicShareRequestLimiter.reset()
    end)

    :ok
  end

  test "requires a valid non-revoked bearer key", %{conn: conn} do
    assert %{"error" => %{"code" => "unauthorized"}} =
             conn |> get("/api/v1/decks") |> json_response(401)

    assert %{"error" => %{"code" => "unauthorized"}} =
             conn
             |> recycle()
             |> put_req_header("authorization", "Bearer invalid")
             |> get("/api/v1/decks")
             |> json_response(401)

    assert {:ok, api_key, token} = ApiKeys.create("Revoked")
    assert {:ok, _} = ApiKeys.revoke(api_key.id)

    assert %{"error" => %{"code" => "unauthorized"}} =
             conn
             |> recycle()
             |> put_req_header("authorization", "Bearer #{token}")
             |> get("/api/v1/decks")
             |> json_response(401)
  end

  test "lists only the instance owner's decks with stable response shape and pagination", %{
    conn: conn
  } do
    assert {:ok, _} = Catalog.import_cards([legal_commander_card(), black_lotus()])
    assert {:ok, alpha} = Catalog.create_deck(%{"name" => "Alpha", "format" => "commander"})
    add_deck_card!(alpha, "Test Commander", 1, "commander")
    add_deck_card!(alpha, "Black Lotus", 2, "mainboard")
    assert {:ok, alpha} = Catalog.ensure_deck_share_token(alpha)
    assert {:ok, _beta} = Catalog.create_deck(%{"name" => "Beta", "format" => "modern"})
    assert {:ok, api_key, token} = ApiKeys.create("The Gathering")

    response =
      conn
      |> Map.put(:host, "attacker.example")
      |> put_req_header("authorization", "Bearer #{token}")
      |> get("/api/v1/decks?page=1&per_page=1")
      |> json_response(200)

    assert %{
             "data" => [deck],
             "pagination" => %{
               "page" => 1,
               "per_page" => 1,
               "total" => 2,
               "total_pages" => 2
             }
           } = response

    assert %{
             "id" => id,
             "name" => "Alpha",
             "format" => "commander",
             "commanders" => ["Test Commander"],
             "commanderColorIdentity" => ["W"],
             "cardCount" => 3,
             "updated_at" => updated_at,
             "publicly_shared" => true,
             "public_share_url" => share_url
           } = deck

    assert id == alpha.id
    assert is_binary(updated_at)
    assert share_url == "#{ManavaultWeb.Endpoint.url()}/share/decks/#{alpha.share_token}"
    refute share_url =~ "attacker.example"

    assert {:ok, used_key} = ApiKeys.authenticate(token)
    assert used_key.id == api_key.id
    assert used_key.last_used_at

    second_page =
      conn
      |> recycle()
      |> put_req_header("authorization", "Bearer #{token}")
      |> get("/api/v1/decks?page=2&per_page=1")
      |> json_response(200)

    assert [%{"name" => "Beta", "publicly_shared" => false, "public_share_url" => nil}] =
             second_page["data"]
  end

  test "shares the public endpoint abuse-protection budget", %{conn: conn} do
    Application.put_env(:manavault, :public_share_rate_limit,
      max_requests_per_ip: 1,
      max_requests_global: 10,
      window_ms: 60_000
    )

    assert conn |> get("/api/v1/decks") |> response(401)

    limited = conn |> recycle() |> get("/api/v1/decks")
    assert get_resp_header(limited, "retry-after") == ["60"]
    assert %{"error" => %{"code" => "rate_limited"}} = json_response(limited, 429)
  end
end
