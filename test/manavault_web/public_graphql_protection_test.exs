defmodule ManavaultWeb.PublicGraphQLProtectionTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Catalog
  alias Manavault.Catalog.{Card, DeckCard}
  alias Manavault.Catalog.Decks.ShareToken
  alias Manavault.PublicShareRequestLimiter
  alias Manavault.Repo

  setup do
    previous_rate_limit = Application.get_env(:manavault, :public_share_rate_limit)
    :ok = PublicShareRequestLimiter.reset()

    on_exit(fn ->
      Application.put_env(:manavault, :public_share_rate_limit, previous_rate_limit)
      PublicShareRequestLimiter.reset()
    end)

    :ok
  end

  test "rejects JSON transport batches" do
    configure_rate_limit(max_requests_per_ip: 2, max_requests_global: 2)

    batch = [
      %{"query" => "query { __typename }"},
      %{"query" => "query { __typename }"}
    ]

    batch_conn =
      build_conn()
      |> put_req_header("content-type", "application/json")
      |> post("/share/graphql", Jason.encode!(batch))

    assert %{"errors" => [%{"message" => "GraphQL request batches are not supported"}]} =
             json_response(batch_conn, 400)

    assert %{"data" => %{"__typename" => "RootQueryType"}} =
             build_conn()
             |> graphql_request("query { __typename }")
             |> json_response(200)
  end

  test "rejects encoded operations transport batches" do
    operations = Jason.encode!([%{"query" => "query { __typename }"}])

    conn =
      build_conn()
      |> put_req_header("content-type", "application/x-www-form-urlencoded")
      |> post("/share/graphql", URI.encode_query(%{"operations" => operations}))

    assert %{"errors" => [%{"message" => "GraphQL request batches are not supported"}]} =
             json_response(conn, 400)
  end

  test "rate limiting happens before request body parsing" do
    configure_rate_limit(max_requests_per_ip: 1, max_requests_global: 1)
    assert build_conn() |> graphql_request("query { __typename }") |> Map.fetch!(:status) == 200

    conn =
      build_conn()
      |> put_req_header("content-type", "application/json")
      |> post("/share/graphql", "{not valid json")

    assert %{"errors" => [%{"message" => "Too many public GraphQL requests"}]} =
             json_response(conn, 429)
  end

  test "rejects token-heavy documents" do
    query = "query { " <> String.duplicate("__typename ", 5_001) <> "}"
    response = build_conn() |> graphql_request(query) |> json_response(200)

    assert [%{"message" => message}] = response["errors"]
    assert message =~ "Token limit exceeded"
    refute Map.has_key?(response, "data")
  end

  test "rejects deeply nested documents" do
    nested_type = String.duplicate("ofType { ", 13) <> "kind" <> String.duplicate(" }", 13)
    query = "query { __type(name: \"Printing\") { fields { type { #{nested_type} } } } }"
    response = build_conn() |> graphql_request(query) |> json_response(200)

    assert [%{"message" => "GraphQL operation exceeds maximum depth 12"}] = response["errors"]
    refute Map.has_key?(response, "data")
  end

  test "rejects connection-amplified documents by complexity" do
    connection = "deckCards(first: 500) { edges { node { quantity } } }"

    selections =
      1..70
      |> Enum.map_join(" ", fn index -> "cards#{index}: #{connection}" end)

    token = String.duplicate("A", 24)
    assert ShareToken.valid?(token)

    query = "query { deck(id: \"#{token}\") { #{selections} } }"
    response = build_conn() |> graphql_request(query) |> json_response(200)

    assert Enum.all?(response["errors"], &(&1["message"] =~ "maximum is 100000"))
    refute Map.has_key?(response, "data")
  end

  test "printing card summaries cannot recurse back into printings" do
    query = """
    query {
      printing: __type(name: "Printing") {
        fields { name type { name kind } }
      }
      summary: __type(name: "PublicCardSummary") {
        fields { name }
      }
    }
    """

    assert %{
             "data" => %{
               "printing" => %{"fields" => printing_fields},
               "summary" => %{"fields" => summary_fields}
             }
           } = build_conn() |> graphql_request(query) |> json_response(200)

    assert %{"type" => %{"name" => "PublicCardSummary"}} =
             Enum.find(printing_fields, &(&1["name"] == "card"))

    refute Enum.any?(summary_fields, &(&1["name"] == "printings"))
  end

  test "public deck connections clamp oversized page requests" do
    {:ok, deck} = Catalog.create_deck(%{"name" => "Clamp Test"})
    {:ok, deck} = Catalog.ensure_deck_share_token(deck)
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    cards =
      for index <- 1..501 do
        %{
          oracle_id: "clamp-card-#{index}",
          name: "Clamp Card #{index}",
          colors: "[]",
          color_identity: "[]",
          legalities: "{}",
          game_changer: false,
          oracle_tags: "[]",
          deck_themes: "[]",
          inserted_at: now,
          updated_at: now
        }
      end

    {501, nil} = Repo.insert_all(Card, cards)

    deck_cards =
      Enum.map(cards, fn card ->
        %{
          deck_id: deck.id,
          oracle_id: card.oracle_id,
          quantity: 1,
          proxy_quantity: 0,
          zone: "mainboard",
          finish: "nonfoil",
          inserted_at: now,
          updated_at: now
        }
      end)

    {501, nil} = Repo.insert_all(DeckCard, deck_cards)

    query = """
    query {
      deck(id: "#{deck.share_token}") {
        deckCards(first: 10000) {
          edges { node { quantity } }
          pageInfo { hasNextPage }
        }
      }
    }
    """

    assert %{
             "data" => %{
               "deck" => %{
                 "deckCards" => %{
                   "edges" => edges,
                   "pageInfo" => %{"hasNextPage" => true}
                 }
               }
             }
           } = build_conn() |> graphql_request(query) |> json_response(200)

    assert length(edges) == 500
  end

  test "per-IP limits bound repeated valid missing-token database lookups" do
    configure_rate_limit(max_requests_per_ip: 2, max_requests_global: 10)
    token = String.duplicate("A", 24)

    {responses, deck_queries} =
      count_deck_queries(fn ->
        for _ <- 1..3 do
          build_conn()
          |> graphql_request("query { deck(id: \"#{token}\") { name } }")
        end
      end)

    assert Enum.map(responses, & &1.status) == [200, 200, 429]
    assert deck_queries == 2
    assert get_resp_header(List.last(responses), "retry-after") != []
  end

  test "global limits apply across client IPs" do
    configure_rate_limit(max_requests_per_ip: 10, max_requests_global: 2)

    statuses =
      for last_octet <- 1..3 do
        build_conn()
        |> Map.put(:remote_ip, {10, 0, 0, last_octet})
        |> graphql_request("query { __typename }")
        |> Map.fetch!(:status)
      end

    assert statuses == [200, 200, 429]
  end

  defp graphql_request(conn, query) do
    post(conn, "/share/graphql", %{"query" => query})
  end

  defp configure_rate_limit(overrides) do
    defaults = [
      window_ms: :timer.minutes(1),
      max_requests_per_ip: 120,
      max_requests_global: 1_200
    ]

    Application.put_env(:manavault, :public_share_rate_limit, Keyword.merge(defaults, overrides))
    PublicShareRequestLimiter.reset()
  end

  defp count_deck_queries(fun) do
    caller = self()
    ref = make_ref()
    handler_id = {__MODULE__, ref}

    :ok =
      :telemetry.attach(
        handler_id,
        [:manavault, :repo, :query],
        fn _event, _measurements, metadata, _config ->
          if metadata[:source] == "decks", do: send(caller, {ref, :deck_query})
        end,
        nil
      )

    try do
      {fun.(), collect_deck_queries(ref, 0)}
    after
      :telemetry.detach(handler_id)
    end
  end

  defp collect_deck_queries(ref, count) do
    receive do
      {^ref, :deck_query} -> collect_deck_queries(ref, count + 1)
    after
      0 -> count
    end
  end
end
