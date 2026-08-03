defmodule Manavault.Trade.ListSource.ManaVaultRemote do
  @moduledoc """
  Fetches a shared deck or want list from another ManaVault instance's
  public GraphQL endpoint.

  Given an absolute `/share/decks/<token>` or `/share/wants/<token>` link,
  the URL's own path, query, and fragment are discarded entirely — only its
  scheme, host, and port are kept to form the origin, and the *only* path
  ever requested there is `POST {origin}/share/graphql`. Only `http` and
  `https` schemes are accepted. This guarantees a pasted link can never be
  used to reach anything else on the linked host, and that a link claiming
  to be this very instance is never trusted without actually asking it —
  it loops back over HTTP to this same server's public endpoint, which
  works the same as any other instance.
  """

  alias Manavault.Trade.ListSource.Http

  @allowed_schemes ~w(http https)
  @max_pages 50

  @deck_query """
  query FetchSharedDeck($id: ID!, $after: String) {
    deck(id: $id) {
      name
      deckCards(first: 1000, after: $after) {
        edges {
          node {
            quantity
            zone
            card {
              name
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
  """

  @wants_query """
  query FetchSharedWants($id: ID!) {
    wantsList(id: $id) {
      entries {
        cardName
        quantity
        setCode
        collectorNumber
      }
    }
  }
  """

  @unsupported_error "Unsupported link. Paste the list text instead."
  @deck_not_found_error "That share link doesn't match a deck on that ManaVault instance. " <>
                          "Paste the list text instead."
  @wants_not_found_error "That share link doesn't match a shared want list on that ManaVault " <>
                           "instance. Paste the list text instead."
  @unreachable_error "Couldn't reach that ManaVault instance to fetch the shared list. " <>
                       "Paste the list text instead."
  @wants_unsupported_error "That ManaVault instance doesn't support shared want lists yet. " <>
                             "Paste the list text instead."
  @wants_source_name "Shared wants"

  @doc """
  Fetches the shared `kind` (`:deck` or `:wants`) at `token` from the origin
  described by `uri` (only its scheme/host/port are used). Returns
  `{:ok, %{source_name, entries}}` or a friendly `{:error, message}`.
  """
  def fetch(kind, %URI{} = uri, token) when kind in [:deck, :wants] and is_binary(token) do
    case origin_url(uri) do
      {:ok, origin} -> fetch_kind(kind, origin, token)
      :error -> {:error, @unsupported_error}
    end
  end

  defp origin_url(%URI{scheme: scheme, host: host, port: port})
       when scheme in @allowed_schemes and is_binary(host) and host != "" do
    {:ok, URI.to_string(%URI{scheme: scheme, host: host, port: port, path: "/share/graphql"})}
  end

  defp origin_url(_uri), do: :error

  defp fetch_kind(:deck, origin, token), do: fetch_deck_page(origin, token, nil, [], @max_pages)
  defp fetch_kind(:wants, origin, token), do: fetch_wants(origin, token)

  defp fetch_deck_page(_origin, _token, _cursor, _acc, 0), do: {:error, @unreachable_error}

  defp fetch_deck_page(origin, token, cursor, acc, pages_left) do
    case post_graphql(origin, @deck_query, %{"id" => token, "after" => cursor}) do
      {:ok, %{"deck" => nil}} ->
        {:error, @deck_not_found_error}

      {:ok,
       %{
         "deck" => %{
           "name" => name,
           "deckCards" => %{"edges" => edges, "pageInfo" => page_info}
         }
       }}
      when is_binary(name) and is_list(edges) and is_map(page_info) ->
        entries = acc ++ normalize_deck_edges(edges)

        case page_info do
          %{"hasNextPage" => true, "endCursor" => next_cursor} when is_binary(next_cursor) ->
            fetch_deck_page(origin, token, next_cursor, entries, pages_left - 1)

          _other ->
            {:ok, %{source_name: name, entries: entries}}
        end

      {:ok, _other} ->
        {:error, @unreachable_error}

      {:error, {:graphql_errors, _errors}} ->
        {:error, @unreachable_error}

      {:error, _reason} ->
        {:error, @unreachable_error}
    end
  end

  defp fetch_wants(origin, token) do
    case post_graphql(origin, @wants_query, %{"id" => token}) do
      {:ok, %{"wantsList" => nil}} ->
        {:error, @wants_not_found_error}

      {:ok, %{"wantsList" => %{"entries" => entries}}} when is_list(entries) ->
        {:ok, %{source_name: @wants_source_name, entries: normalize_want_entries(entries)}}

      {:ok, _other} ->
        {:error, @unreachable_error}

      {:error, {:graphql_errors, errors}} ->
        if wants_field_undefined?(errors) do
          {:error, @wants_unsupported_error}
        else
          {:error, @unreachable_error}
        end

      {:error, _reason} ->
        {:error, @unreachable_error}
    end
  end

  # Sends the GraphQL request and unwraps a clean `data` map. Any top-level
  # `errors`, a response with neither `data` nor `errors`, or a transport
  # failure are all surfaced distinctly to the caller so it can pick the
  # right friendly message.
  defp post_graphql(origin, query, variables) do
    case Http.post_json(origin, %{"query" => query, "variables" => variables},
           req_options: req_options()
         ) do
      {:ok, %{"data" => data} = payload} when is_map(data) ->
        case Map.get(payload, "errors") do
          errors when is_list(errors) and errors != [] -> {:error, {:graphql_errors, errors}}
          _no_errors -> {:ok, data}
        end

      {:ok, %{"errors" => errors}} when is_list(errors) ->
        {:error, {:graphql_errors, errors}}

      {:ok, _other} ->
        {:error, :malformed}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp wants_field_undefined?(errors) do
    Enum.any?(errors, fn
      %{"message" => message} when is_binary(message) -> String.contains?(message, "wantsList")
      _other -> false
    end)
  end

  defp normalize_deck_edges(edges) do
    edges |> Enum.map(&deck_entry_from_edge/1) |> Enum.reject(&is_nil/1)
  end

  defp deck_entry_from_edge(%{
         "node" => %{"quantity" => quantity, "card" => %{"name" => name}} = node
       })
       when is_integer(quantity) and is_binary(name) do
    %{
      name: name,
      quantity: quantity,
      zone: node |> Map.get("zone") |> zone_or_default(),
      set_code: nil,
      collector_number: nil
    }
  end

  defp deck_entry_from_edge(_edge), do: nil

  defp zone_or_default(zone) when is_binary(zone), do: zone
  defp zone_or_default(_zone), do: "mainboard"

  defp normalize_want_entries(entries) do
    entries |> Enum.map(&want_entry_from_node/1) |> Enum.reject(&is_nil/1)
  end

  defp want_entry_from_node(%{"cardName" => name} = node) when is_binary(name) do
    %{
      name: name,
      quantity: node |> Map.get("quantity", 1) |> to_quantity(),
      zone: "mainboard",
      set_code: Map.get(node, "setCode"),
      collector_number: Map.get(node, "collectorNumber")
    }
  end

  defp want_entry_from_node(_node), do: nil

  defp to_quantity(quantity) when is_integer(quantity) and quantity > 0, do: quantity
  defp to_quantity(_quantity), do: 1

  defp req_options, do: Application.get_env(:manavault, :trade_manavault_req_options, [])
end
