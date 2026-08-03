defmodule Manavault.Trade.ListSource.ManaVaultRemote do
  @moduledoc """
  Fetches a shared deck, want list, or trade binder from another
  ManaVault instance's public GraphQL endpoint.

  Given an absolute `/share/decks/<token>`, `/share/wants/<token>`, or
  `/share/binder/<token>` link, the URL's own path, query, and fragment
  are discarded entirely — only its scheme, host, and port are kept to
  form the origin, and the *only* path ever requested there is
  `POST {origin}/share/graphql`. Only `http` and `https` schemes are
  accepted. This guarantees a pasted link can never be used to reach
  anything else on the linked host, and that a link claiming to be this
  very instance is never trusted without actually asking it — it loops
  back over HTTP to this same server's public endpoint, which works the
  same as any other instance.
  """

  alias Manavault.Trade.ListSource.Http

  @allowed_schemes ~w(http https)
  @import_timeout_ms 30_000
  @max_page_response_bytes 5_000_000
  @max_response_bytes 10_000_000
  @max_entries 10_000
  @max_pages 10

  @deck_query """
  query FetchSharedDeck($id: ID!, $after: String) {
    deck(id: $id) {
      name
      deckCards(first: 500, after: $after) {
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

  @binder_query """
  query FetchSharedBinder($id: ID!) {
    binderList(id: $id) {
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
  @limit_error "That shared list is too large or took too long to import. " <>
                 "Paste the list text instead."
  @pagination_error "That ManaVault instance returned invalid list pagination. " <>
                      "Paste the list text instead."
  @wants_unsupported_error "That ManaVault instance doesn't support shared want lists yet. " <>
                             "Paste the list text instead."
  @wants_source_name "Shared wants"
  @binder_not_found_error "That share link doesn't match a shared trade binder on that " <>
                            "ManaVault instance. Paste the list text instead."
  @binder_unsupported_error "That ManaVault instance doesn't support shared trade binders " <>
                              "yet. Paste the list text instead."
  @binder_source_name "Trade binder"

  @doc """
  Fetches the shared `kind` (`:deck`, `:wants`, or `:binder`) at `token`
  from the origin described by `uri` (only its scheme/host/port are
  used). Returns `{:ok, %{source_name, entries}}` or a friendly
  `{:error, message}`.
  """
  def fetch(kind, %URI{} = uri, token)
      when kind in [:deck, :wants, :binder] and is_binary(token) do
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

  defp fetch_kind(kind, origin, token) do
    task = Task.async(fn -> do_fetch_kind(kind, origin, token) end)

    case Task.yield(task, @import_timeout_ms) || Task.shutdown(task, :brutal_kill) do
      {:ok, result} -> result
      {:exit, _reason} -> {:error, @unreachable_error}
      nil -> {:error, @limit_error}
    end
  end

  defp do_fetch_kind(kind, origin, token) do
    budget = %{
      deadline_ms: now_ms() + @import_timeout_ms,
      response_bytes: 0,
      entry_count: 0,
      page_count: 0
    }

    case kind do
      :deck -> fetch_deck_page(origin, token, nil, [], MapSet.new(), budget)
      :wants -> fetch_wants(origin, token, budget)
      :binder -> fetch_binder(origin, token, budget)
    end
  end

  defp fetch_deck_page(origin, token, cursor, page_acc, seen_cursors, budget) do
    case post_graphql(origin, @deck_query, %{"id" => token, "after" => cursor}, budget) do
      {:ok, %{"deck" => nil}, _budget} ->
        {:error, @deck_not_found_error}

      {:ok,
       %{
         "deck" => %{
           "name" => name,
           "deckCards" => %{"edges" => edges, "pageInfo" => page_info}
         }
       }, budget}
      when is_binary(name) and is_list(edges) and is_map(page_info) ->
        entries = normalize_deck_edges(edges)

        with {:ok, budget} <- add_entries(budget, entries) do
          case page_info do
            %{"hasNextPage" => true, "endCursor" => next_cursor}
            when is_binary(next_cursor) and next_cursor != "" ->
              if MapSet.member?(seen_cursors, next_cursor) or next_cursor == cursor do
                {:error, @pagination_error}
              else
                fetch_deck_page(
                  origin,
                  token,
                  next_cursor,
                  [entries | page_acc],
                  MapSet.put(seen_cursors, next_cursor),
                  budget
                )
              end

            %{"hasNextPage" => true} ->
              {:error, @pagination_error}

            _other ->
              entries = page_acc |> Enum.reverse([entries]) |> List.flatten()
              {:ok, %{source_name: name, entries: entries}}
          end
        else
          {:error, :import_limit} -> {:error, @limit_error}
        end

      {:ok, _other, _budget} ->
        {:error, @unreachable_error}

      {:error, {:graphql_errors, _errors}} ->
        {:error, @unreachable_error}

      {:error, :import_limit} ->
        {:error, @limit_error}

      {:error, _reason} ->
        {:error, @unreachable_error}
    end
  end

  defp fetch_wants(origin, token, budget) do
    case post_graphql(origin, @wants_query, %{"id" => token}, budget) do
      {:ok, %{"wantsList" => nil}, _budget} ->
        {:error, @wants_not_found_error}

      {:ok, %{"wantsList" => %{"entries" => entries}}, budget} when is_list(entries) ->
        entries = normalize_want_entries(entries)

        case add_entries(budget, entries) do
          {:ok, _budget} -> {:ok, %{source_name: @wants_source_name, entries: entries}}
          {:error, :import_limit} -> {:error, @limit_error}
        end

      {:ok, _other, _budget} ->
        {:error, @unreachable_error}

      {:error, {:graphql_errors, errors}} ->
        if wants_field_undefined?(errors) do
          {:error, @wants_unsupported_error}
        else
          {:error, @unreachable_error}
        end

      {:error, :import_limit} ->
        {:error, @limit_error}

      {:error, _reason} ->
        {:error, @unreachable_error}
    end
  end

  defp fetch_binder(origin, token, budget) do
    case post_graphql(origin, @binder_query, %{"id" => token}, budget) do
      {:ok, %{"binderList" => nil}, _budget} ->
        {:error, @binder_not_found_error}

      {:ok, %{"binderList" => %{"entries" => entries}}, budget} when is_list(entries) ->
        entries = normalize_binder_entries(entries)

        case add_entries(budget, entries) do
          {:ok, _budget} -> {:ok, %{source_name: @binder_source_name, entries: entries}}
          {:error, :import_limit} -> {:error, @limit_error}
        end

      {:ok, _other, _budget} ->
        {:error, @unreachable_error}

      {:error, {:graphql_errors, errors}} ->
        if binder_field_undefined?(errors) do
          {:error, @binder_unsupported_error}
        else
          {:error, @unreachable_error}
        end

      {:error, :import_limit} ->
        {:error, @limit_error}

      {:error, _reason} ->
        {:error, @unreachable_error}
    end
  end

  # Sends the GraphQL request and unwraps a clean `data` map. Any top-level
  # `errors`, a response with neither `data` nor `errors`, or a transport
  # failure are all surfaced distinctly to the caller so it can pick the
  # right friendly message.
  defp post_graphql(origin, query, variables, budget) do
    with {:ok, remaining_ms, remaining_bytes} <- remaining_budget(budget),
         result <-
           Http.post_json_with_size(origin, %{"query" => query, "variables" => variables},
             connect_timeout: remaining_ms,
             receive_timeout: remaining_ms,
             max_bytes: min(@max_page_response_bytes, remaining_bytes),
             req_options: req_options()
           ),
         {:ok, budget} <- account_response(result, budget) do
      case result do
        {:ok, %{"data" => data} = payload, _response_bytes} when is_map(data) ->
          case Map.get(payload, "errors") do
            errors when is_list(errors) and errors != [] -> {:error, {:graphql_errors, errors}}
            _no_errors -> {:ok, data, budget}
          end

        {:ok, %{"errors" => errors}, _response_bytes} when is_list(errors) ->
          {:error, {:graphql_errors, errors}}

        {:ok, _other, _response_bytes} ->
          {:error, :malformed}
      end
    end
  end

  defp account_response({:ok, _payload, response_bytes}, budget) do
    budget = %{
      budget
      | response_bytes: budget.response_bytes + response_bytes,
        page_count: budget.page_count + 1
    }

    if now_ms() >= budget.deadline_ms or budget.response_bytes > @max_response_bytes do
      {:error, :import_limit}
    else
      {:ok, budget}
    end
  end

  defp account_response({:error, :body_too_large}, _budget), do: {:error, :import_limit}
  defp account_response({:error, reason}, _budget), do: {:error, reason}

  defp remaining_budget(budget) do
    remaining_ms = budget.deadline_ms - now_ms()
    remaining_bytes = @max_response_bytes - budget.response_bytes

    if remaining_ms > 0 and remaining_bytes > 0 and budget.page_count < @max_pages do
      {:ok, remaining_ms, remaining_bytes}
    else
      {:error, :import_limit}
    end
  end

  defp add_entries(budget, entries) do
    budget = %{budget | entry_count: budget.entry_count + length(entries)}

    if budget.entry_count <= @max_entries do
      {:ok, budget}
    else
      {:error, :import_limit}
    end
  end

  defp wants_field_undefined?(errors) do
    Enum.any?(errors, fn
      %{"message" => message} when is_binary(message) -> String.contains?(message, "wantsList")
      _other -> false
    end)
  end

  defp binder_field_undefined?(errors) do
    Enum.any?(errors, fn
      %{"message" => message} when is_binary(message) -> String.contains?(message, "binderList")
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

  defp zone_or_default(zone) when zone in ["sideboard", "maybeboard"], do: "considering"
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

  defp normalize_binder_entries(entries) do
    entries |> Enum.map(&binder_entry_from_node/1) |> Enum.reject(&is_nil/1)
  end

  defp binder_entry_from_node(%{"cardName" => name} = node) when is_binary(name) do
    %{
      name: name,
      quantity: node |> Map.get("quantity", 1) |> to_quantity(),
      zone: "mainboard",
      set_code: Map.get(node, "setCode"),
      collector_number: Map.get(node, "collectorNumber")
    }
  end

  defp binder_entry_from_node(_node), do: nil

  defp to_quantity(quantity) when is_integer(quantity) and quantity > 0, do: quantity
  defp to_quantity(_quantity), do: 1

  defp now_ms do
    Application.get_env(:manavault, :trade_manavault_monotonic_time, fn ->
      System.monotonic_time(:millisecond)
    end).()
  end

  defp req_options, do: Application.get_env(:manavault, :trade_manavault_req_options, [])
end
