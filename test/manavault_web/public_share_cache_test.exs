defmodule ManavaultWeb.PublicShareCacheTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Catalog
  alias Manavault.Catalog.Cache
  alias Manavault.Catalog.Deck
  alias Manavault.Catalog.Decks.ShareToken

  test "malformed public share tokens preserve response contracts without cache or database work" do
    token = "not-a-share-token"

    {{html, svg, png, graphql}, deck_queries} =
      count_deck_queries(fn ->
        {
          get(build_conn(), "/share/decks/#{token}"),
          get(build_conn(), "/share/decks/#{token}/preview.svg"),
          get(build_conn(), "/share/decks/#{token}/preview.png"),
          shared_deck_request(token)
        }
      end)

    assert html_response(html, 200) =~ "Shared deck · ManaVault"
    assert response(svg, 404) == ""
    assert response(png, 404) == ""
    assert %{"data" => %{"deck" => nil}} = json_response(graphql, 200)
    refute Map.has_key?(json_response(graphql, 200), "errors")
    assert deck_queries == 0
    assert Manavault.Cache.count_all!() == 0
  end

  test "valid missing public share tokens keep the established not-found results without cache residue" do
    token = String.duplicate("A", 24)
    assert ShareToken.valid?(token)

    {{html, svg, png, graphql}, deck_queries} =
      count_deck_queries(fn ->
        {
          get(build_conn(), "/share/decks/#{token}"),
          get(build_conn(), "/share/decks/#{token}/preview.svg"),
          get(build_conn(), "/share/decks/#{token}/preview.png"),
          shared_deck_request(token)
        }
      end)

    assert html_response(html, 200) =~ "Shared deck · ManaVault"
    assert response(svg, 404) == ""
    assert response(png, 404) == ""
    assert %{"data" => %{"deck" => nil}} = json_response(graphql, 200)
    refute Map.has_key?(json_response(graphql, 200), "errors")
    assert deck_queries == 4
    assert Manavault.Cache.count_all!() == 0
  end

  test "public HTML, SVG, PNG, and GraphQL reuse positive share lookups" do
    {:ok, deck} = Catalog.create_deck(%{"name" => "Public Cache Deck"})
    {:ok, deck} = Catalog.ensure_deck_share_token(deck)

    {{html, svg, png, graphql}, deck_queries} =
      count_deck_queries(fn ->
        {
          get(build_conn(), "/share/decks/#{deck.share_token}"),
          get(build_conn(), "/share/decks/#{deck.share_token}/preview.svg"),
          get(build_conn(), "/share/decks/#{deck.share_token}/preview.png"),
          shared_deck_request(deck.share_token)
        }
      end)

    assert html_response(html, 200) =~ "Public Cache Deck"
    assert get_resp_header(svg, "content-type") == ["image/svg+xml; charset=utf-8"]
    assert response(svg, 200) =~ "Public Cache Deck"
    assert get_resp_header(png, "content-type") == ["image/png"]
    assert <<137, 80, 78, 71, 13, 10, 26, 10, _rest::binary>> = response(png, 200)

    assert %{"data" => %{"deck" => %{"name" => "Public Cache Deck"}}} =
             json_response(graphql, 200)

    assert deck_queries == 2
    assert Manavault.Cache.count_all!() >= 2
    assert {:ok, %Deck{id: deck_id}} = Cache.fetch({:deck_by_share_token, deck.share_token, []})

    assert {:ok, %Deck{id: ^deck_id}} =
             Cache.fetch({:deck_by_share_token, deck.share_token, [preload?: false]})
  end

  defp shared_deck_request(token) do
    post(build_conn(), "/share/graphql", %{
      "query" => "query SharedDeck($id: ID!) { deck(id: $id) { name } }",
      "variables" => %{"id" => token}
    })
  end

  defp count_deck_queries(fun) when is_function(fun, 0) do
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
      result = fun.()
      {result, collect_deck_queries(ref, 0)}
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
