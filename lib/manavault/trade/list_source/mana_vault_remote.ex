defmodule Manavault.Trade.ListSource.ManaVaultRemote do
  @moduledoc """
  Fetches a shared deck, want list, or trade binder from another
  ManaVault instance's public GraphQL endpoint.

  Given an absolute `/share/decks/<token>`, `/share/wants/<token>`, or
  `/share/binder/<token>` link, the URL's own path, query, and fragment
  are discarded entirely — only its scheme, host, and port are kept to
  form the origin, and the *only* path ever requested there is
  `POST {origin}/share/graphql`. Only `http` and `https` schemes are
  accepted. Public destinations are allowed by default; non-public addresses
  require an explicit operator allowlist entry. DNS answers are validated and
  the selected address is pinned while the original HTTP and TLS hostname is
  retained. This guarantees a pasted link can never choose another path or
  bypass the destination policy through DNS rebinding.
  """

  import Bitwise

  alias Manavault.Trade.ListSource.Http

  @allowed_schemes ~w(http https)
  @import_timeout_ms 30_000
  @max_page_response_bytes 5_000_000
  @max_response_bytes 10_000_000
  @max_entries 10_000
  @max_pages 10
  @ipv4_non_public_cidrs [
    {{0, 0, 0, 0}, 8},
    {{10, 0, 0, 0}, 8},
    {{100, 64, 0, 0}, 10},
    {{127, 0, 0, 0}, 8},
    {{169, 254, 0, 0}, 16},
    {{172, 16, 0, 0}, 12},
    {{192, 0, 0, 0}, 24},
    {{192, 0, 2, 0}, 24},
    {{192, 88, 99, 0}, 24},
    {{192, 168, 0, 0}, 16},
    {{198, 18, 0, 0}, 15},
    {{198, 51, 100, 0}, 24},
    {{203, 0, 113, 0}, 24},
    {{224, 0, 0, 0}, 4},
    {{240, 0, 0, 0}, 4}
  ]
  @ipv6_non_public_cidrs [
    {{0x2001, 0, 0, 0, 0, 0, 0, 0}, 23},
    {{0x2001, 0xDB8, 0, 0, 0, 0, 0, 0}, 32},
    {{0x2002, 0, 0, 0, 0, 0, 0, 0}, 16},
    {{0x3FFF, 0, 0, 0, 0, 0, 0, 0}, 20}
  ]

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
    case destination(uri) do
      {:ok, origin, destination_options} ->
        fetch_kind(kind, origin, token, destination_options)

      :error ->
        {:error, @unsupported_error}
    end
  end

  defp destination(%URI{scheme: scheme, host: host, port: port})
       when scheme in @allowed_schemes and is_binary(host) and host != "" do
    with {:ok, addresses} <- resolve(host),
         true <- addresses != [] and Enum.all?(addresses, &allowed_address?(host, &1)) do
      address = hd(addresses)
      address_host = address |> :inet.ntoa() |> to_string()

      origin =
        URI.to_string(%URI{
          scheme: scheme,
          host: address_host,
          port: port,
          path: "/share/graphql"
        })

      options = [
        headers: [{"host", authority(host, scheme, port)}],
        connect_options: [hostname: host, protocols: [:http1]]
      ]

      {:ok, origin, options}
    else
      _reason -> :error
    end
  end

  defp destination(_uri), do: :error

  defp fetch_kind(kind, origin, token, destination_options) do
    task = Task.async(fn -> do_fetch_kind(kind, origin, token, destination_options) end)

    case Task.yield(task, @import_timeout_ms) || Task.shutdown(task, :brutal_kill) do
      {:ok, result} -> result
      {:exit, _reason} -> {:error, @unreachable_error}
      nil -> {:error, @limit_error}
    end
  end

  defp do_fetch_kind(kind, origin, token, destination_options) do
    budget = %{
      deadline_ms: now_ms() + @import_timeout_ms,
      response_bytes: 0,
      entry_count: 0,
      page_count: 0
    }

    case kind do
      :deck ->
        fetch_deck_page(origin, token, nil, [], MapSet.new(), budget, destination_options)

      :wants ->
        fetch_wants(origin, token, budget, destination_options)

      :binder ->
        fetch_binder(origin, token, budget, destination_options)
    end
  end

  defp fetch_deck_page(
         origin,
         token,
         cursor,
         page_acc,
         seen_cursors,
         budget,
         destination_options
       ) do
    case post_graphql(
           origin,
           @deck_query,
           %{"id" => token, "after" => cursor},
           budget,
           destination_options
         ) do
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
                  budget,
                  destination_options
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

  defp fetch_wants(origin, token, budget, destination_options) do
    case post_graphql(origin, @wants_query, %{"id" => token}, budget, destination_options) do
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

  defp fetch_binder(origin, token, budget, destination_options) do
    case post_graphql(origin, @binder_query, %{"id" => token}, budget, destination_options) do
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
  defp post_graphql(origin, query, variables, budget, destination_options) do
    with {:ok, remaining_ms, remaining_bytes} <- remaining_budget(budget),
         result <-
           Http.post_json_with_size(origin, %{"query" => query, "variables" => variables},
             connect_timeout: remaining_ms,
             receive_timeout: remaining_ms,
             max_bytes: min(@max_page_response_bytes, remaining_bytes),
             req_options: req_options(),
             headers: Keyword.fetch!(destination_options, :headers),
             connect_options: Keyword.fetch!(destination_options, :connect_options)
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

  defp resolve(host) do
    case :inet.parse_address(String.to_charlist(host)) do
      {:ok, address} -> {:ok, [address]}
      {:error, :einval} -> resolver().(host)
    end
  end

  defp resolver do
    Application.get_env(:manavault, :trade_manavault_resolver, &resolve_dns/1)
  end

  defp resolve_dns(host) do
    charlist_host = String.to_charlist(host)

    addresses =
      [:inet, :inet6]
      |> Enum.flat_map(fn family ->
        case :inet.getaddrs(charlist_host, family) do
          {:ok, addresses} -> addresses
          {:error, _reason} -> []
        end
      end)
      |> Enum.uniq()

    if addresses == [], do: {:error, :nxdomain}, else: {:ok, addresses}
  end

  defp allowed_address?(host, address) do
    host_allowed?(host) || public_address?(address) || cidr_allowed?(address)
  end

  defp host_allowed?(host) do
    normalized_host = normalize_host(host)

    Enum.any?(destination_allowlist(), fn entry ->
      not String.contains?(entry, "/") and normalize_host(entry) == normalized_host
    end)
  end

  defp cidr_allowed?(address) do
    Enum.any?(destination_allowlist(), fn entry ->
      case parse_cidr(entry) do
        {:ok, network, prefix} -> in_cidr?(address, network, prefix)
        :error -> false
      end
    end)
  end

  defp destination_allowlist do
    Application.get_env(:manavault, :trade_manavault_destination_allowlist, [])
  end

  defp normalize_host(host),
    do: host |> String.trim() |> String.trim_trailing(".") |> String.downcase()

  defp parse_cidr(entry) do
    case String.split(entry, "/", parts: 2) do
      [address, prefix] ->
        with {:ok, address} <- :inet.parse_address(String.to_charlist(address)),
             {prefix, ""} <- Integer.parse(prefix),
             true <- prefix >= 0 and prefix <= address_bits(address) do
          {:ok, address, prefix}
        else
          _reason -> :error
        end

      _other ->
        :error
    end
  end

  defp public_address?({0, 0, 0, 0, 0, 65_535, high, low}) do
    public_address?({high >>> 8, high &&& 255, low >>> 8, low &&& 255})
  end

  defp public_address?({_, _, _, _} = address) do
    Enum.all?(@ipv4_non_public_cidrs, fn {network, prefix} ->
      not in_cidr?(address, network, prefix)
    end)
  end

  defp public_address?({_, _, _, _, _, _, _, _} = address) do
    in_cidr?(address, {0x2000, 0, 0, 0, 0, 0, 0, 0}, 3) and
      Enum.all?(@ipv6_non_public_cidrs, fn {network, prefix} ->
        not in_cidr?(address, network, prefix)
      end)
  end

  defp in_cidr?(address, network, prefix)
       when tuple_size(address) == tuple_size(network) do
    bits = address_bits(address)
    shift = bits - prefix
    address_to_integer(address) >>> shift == address_to_integer(network) >>> shift
  end

  defp in_cidr?(_address, _network, _prefix), do: false

  defp address_bits(address) when tuple_size(address) == 4, do: 32
  defp address_bits(address) when tuple_size(address) == 8, do: 128

  defp address_to_integer(address) do
    unit_bits = if tuple_size(address) == 4, do: 8, else: 16

    address
    |> Tuple.to_list()
    |> Enum.reduce(0, fn part, integer -> (integer <<< unit_bits) + part end)
  end

  defp authority(host, scheme, port) do
    host = if String.contains?(host, ":"), do: "[#{host}]", else: host

    if port in [nil, default_port(scheme)] do
      host
    else
      "#{host}:#{port}"
    end
  end

  defp default_port("http"), do: 80
  defp default_port("https"), do: 443

  defp req_options, do: Application.get_env(:manavault, :trade_manavault_req_options, [])
end
