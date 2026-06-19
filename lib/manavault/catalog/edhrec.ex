defmodule Manavault.Catalog.EDHRec do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{
    Card,
    CollectionItem,
    Deck,
    DeckAllocation,
    DeckCard,
    Printing
  }

  alias Manavault.Repo

  @recs_url "https://edhrec.com/api/recs"
  @commander_page_base_url "https://json.edhrec.com/pages/commanders"
  @headers [
    {"accept", "application/json"},
    {"content-type", "application/json"},
    {"origin", "https://edhrec.com"},
    {"referer", "https://edhrec.com/recs"},
    {"user-agent",
     "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ManaVault/0.1"}
  ]

  def recs(%Deck{} = deck, opts \\ []) when is_list(opts) do
    deck = Repo.preload(deck, deck_preloads(), force: true)
    payload = recs_payload(deck, opts)
    fetch = Keyword.get(opts, :fetch, &fetch_recs/1)
    fetch_commander_page = Keyword.get(opts, :fetch_commander_page, &fetch_commander_page/1)

    with :ok <- validate_payload(payload),
         {:ok, response} <- fetch.(payload) do
      {:ok, normalize_recs_response(deck, response, fetch_commander_page)}
    end
  end

  def recs_payload(%Deck{} = deck, opts \\ []) when is_list(opts) do
    deck = Repo.preload(deck, deck_preloads(), force: true)

    %{
      "cards" =>
        deck.deck_cards
        |> Enum.reject(&(&1.zone == "maybeboard"))
        |> Enum.sort_by(&{zone_order(&1.zone), &1.card.name, &1.id})
        |> Enum.map(&deck_card_line/1),
      "commanders" =>
        deck.deck_cards
        |> Enum.filter(&(&1.zone == "commander"))
        |> Enum.sort_by(& &1.card.name)
        |> Enum.map(& &1.card.name),
      "name" => "",
      "options" => %{
        "excludeLands" => Keyword.get(opts, :exclude_lands, false),
        "offset" => Keyword.get(opts, :offset, 0)
      }
    }
  end

  def fetch_recs(payload) when is_map(payload) do
    case Req.post(@recs_url, json: payload, headers: @headers, receive_timeout: 20_000) do
      {:ok, %{status: status, body: body}} when status in 200..299 ->
        decode_response_body(body)

      {:ok, %{status: status}} ->
        {:error, {:edhrec_http_error, status}}

      {:error, exception} ->
        {:error, {:edhrec_request_failed, Exception.message(exception)}}
    end
  end

  def fetch_commander_page(name) when is_binary(name) do
    url = "#{@commander_page_base_url}/#{card_slug(name)}.json"

    case Req.get(url, headers: [{"accept", "application/json"}], receive_timeout: 20_000) do
      {:ok, %{status: status, body: body}} when status in 200..299 ->
        decode_response_body(body)

      {:ok, %{status: status}} ->
        {:error, {:edhrec_commander_http_error, status}}

      {:error, exception} ->
        {:error, {:edhrec_commander_request_failed, Exception.message(exception)}}
    end
  end

  def normalize_recs_response(
        %Deck{} = deck,
        response,
        fetch_commander_page \\ &fetch_commander_page/1
      )
      when is_map(response) do
    deck = Repo.preload(deck, deck_preloads(), force: true)
    commander_names = response |> Map.get("commanders", []) |> Enum.map(&entry_name/1)

    %{
      commander_names: commander_names,
      recommendations: normalize_entries(Map.get(response, "inRecs", []), deck),
      cuts: normalize_entries(Map.get(response, "outRecs", []), deck),
      commander_pages: commander_pages(commander_names, fetch_commander_page),
      more: Map.get(response, "more", false) == true
    }
  end

  defp commander_pages(names, fetch_commander_page) do
    names
    |> Enum.uniq()
    |> Enum.map(fn name ->
      case fetch_commander_page.(name) do
        {:ok, page} when is_map(page) -> normalize_commander_page(name, page)
        _error -> nil
      end
    end)
    |> Enum.reject(&is_nil/1)
  end

  defp normalize_commander_page(name, page) do
    container = Map.get(page, "container", %{})
    json_dict = Map.get(container, "json_dict", %{})
    card = Map.get(json_dict, "card", %{})

    %{
      name: page_value(card, "name") || name,
      title: page_value(page, "title") || page_value(page, "header") || name,
      description:
        page_value(container, "description") || page_value(page, "description") ||
          "EDHREC commander data",
      url: "https://edhrec.com/commanders/#{card_slug(name)}",
      rank: page_integer(card, "rank"),
      deck_count: page_integer(card, "num_decks") || page_integer(page, "num_decks_avg"),
      salt: page_number(card, "salt"),
      avg_price: page_number(page, "avg_price"),
      color_identity: page_list(card, "color_identity"),
      similar: page_list(page, "similar"),
      themes: page_themes(page),
      stats: page_stats(page),
      sections:
        page
        |> get_in(["container", "json_dict", "cardlists"])
        |> normalize_commander_sections()
    }
  end

  defp normalize_commander_sections(cardlists) when is_list(cardlists) do
    cardlists
    |> Enum.map(&normalize_commander_section/1)
    |> Enum.reject(&is_nil/1)
  end

  defp normalize_commander_sections(_cardlists), do: []

  defp normalize_commander_section(%{} = section) do
    cards =
      section
      |> Map.get("cardviews", [])
      |> Enum.map(&normalize_commander_card/1)
      |> Enum.reject(&is_nil/1)

    if cards == [] do
      nil
    else
      %{
        header: page_value(section, "header") || "Cards",
        tag: page_value(section, "tag"),
        cards: cards
      }
    end
  end

  defp normalize_commander_section(_section), do: nil

  defp normalize_commander_card(%{} = entry) do
    name = entry_name(entry)

    if name == "" do
      nil
    else
      local_card = local_card(page_value(entry, "oracle_id") || page_value(entry, "id"), name)

      %{
        name: name,
        oracle_id: local_card_oracle_id(local_card),
        synergy: page_number(entry, "synergy"),
        inclusion: page_integer(entry, "inclusion"),
        num_decks: page_integer(entry, "num_decks"),
        potential_decks: page_integer(entry, "potential_decks"),
        url: edhrec_path(page_value(entry, "url"), "https://edhrec.com/cards/#{card_slug(name)}"),
        card: local_card,
        collection_status: collection_status(local_card, nil)
      }
    end
  end

  defp normalize_commander_card(_entry), do: nil

  defp page_themes(page) do
    page
    |> get_in(["panels", "taglinks"])
    |> case do
      tags when is_list(tags) ->
        tags
        |> Enum.map(fn tag ->
          %{
            name: page_value(tag, "value"),
            slug: page_value(tag, "slug"),
            count: page_integer(tag, "count")
          }
        end)
        |> Enum.reject(&is_nil(&1.name))
        |> Enum.take(12)

      _other ->
        []
    end
  end

  defp page_stats(page) do
    [
      {"Average price", page_money(page_number(page, "avg_price"))},
      {"Average deck size", page_integer(page, "deck_size")},
      {"Average decks", page_integer(page, "num_decks_avg")},
      {"Creatures", page_integer(page, "creature")},
      {"Instants", page_integer(page, "instant")},
      {"Sorceries", page_integer(page, "sorcery")},
      {"Artifacts", page_integer(page, "artifact")},
      {"Enchantments", page_integer(page, "enchantment")},
      {"Planeswalkers", page_integer(page, "planeswalker")},
      {"Lands", page_integer(page, "land")},
      {"Basics", page_integer(page, "basic")},
      {"Nonbasics", page_integer(page, "nonbasic")}
    ]
    |> Enum.reject(fn {_label, value} -> is_nil(value) end)
    |> Enum.map(fn {label, value} -> %{label: label, value: to_string(value)} end)
  end

  defp page_money(nil), do: nil
  defp page_money(value), do: "$#{round(value)}"

  defp page_value(map, key) when is_map(map) do
    case Map.get(map, key) || Map.get(map, String.to_atom(key)) do
      value when is_binary(value) and value != "" -> value
      _value -> nil
    end
  end

  defp page_value(_map, _key), do: nil

  defp page_number(map, key) when is_map(map) do
    case Map.get(map, key) || Map.get(map, String.to_atom(key)) do
      value when is_integer(value) -> value
      value when is_float(value) -> value
      _value -> nil
    end
  end

  defp page_number(_map, _key), do: nil

  defp page_integer(map, key) when is_map(map) do
    case page_number(map, key) do
      value when is_integer(value) -> value
      value when is_float(value) -> round(value)
      _value -> nil
    end
  end

  defp page_integer(_map, _key), do: nil

  defp page_list(map, key) when is_map(map) do
    case Map.get(map, key) || Map.get(map, String.to_atom(key)) do
      values when is_list(values) -> Enum.filter(values, &is_binary/1)
      _value -> []
    end
  end

  defp page_list(_map, _key), do: []

  defp edhrec_path(nil, fallback), do: fallback
  defp edhrec_path("http" <> _rest = url, _fallback), do: url
  defp edhrec_path("/" <> _rest = path, _fallback), do: "https://edhrec.com#{path}"
  defp edhrec_path(_path, fallback), do: fallback

  defp decode_response_body(body) when is_map(body), do: {:ok, body}

  defp decode_response_body(body) when is_binary(body) do
    case Jason.decode(body) do
      {:ok, decoded} when is_map(decoded) -> {:ok, decoded}
      {:ok, _decoded} -> {:error, :edhrec_unexpected_response}
      {:error, _error} -> {:error, :edhrec_unexpected_response}
    end
  end

  defp decode_response_body(_body), do: {:error, :edhrec_unexpected_response}

  defp validate_payload(%{"commanders" => [_ | _], "cards" => [_ | _]}), do: :ok
  defp validate_payload(%{"commanders" => []}), do: {:error, :edhrec_missing_commander}
  defp validate_payload(%{"cards" => []}), do: {:error, :edhrec_empty_deck}
  defp validate_payload(_payload), do: {:error, :edhrec_invalid_deck}

  defp normalize_entries(entries, %Deck{} = deck) when is_list(entries) do
    entries
    |> Enum.map(&normalize_entry(&1, deck))
    |> Enum.reject(&is_nil/1)
  end

  defp normalize_entries(_entries, _deck), do: []

  defp normalize_entry(%{} = entry, %Deck{} = deck) do
    name = entry_name(entry)

    if name == "" do
      nil
    else
      oracle_id = entry_oracle_id(entry)
      local_card = local_card(oracle_id, name)
      deck_card = matching_deck_card(deck, oracle_id, name)

      %{
        name: name,
        oracle_id: oracle_id || local_card_oracle_id(local_card),
        primary_type: entry_string(entry, "primary_type"),
        score: entry_number(entry, "score"),
        salt: entry_number(entry, "salt"),
        card: local_card,
        collection_status: collection_status(local_card, deck_card),
        edhrec_url: "https://edhrec.com/cards/#{card_slug(name)}"
      }
    end
  end

  defp normalize_entry(_entry, _deck), do: nil

  defp collection_status(_local_card, %DeckCard{} = deck_card) do
    deck_card
    |> deck_card_allocation_status()
    |> stringify_status()
  end

  defp collection_status(%Card{} = card, _deck_card) do
    candidates = collection_candidates(card.oracle_id)
    other_allocations = allocation_counts_for_oracle_id(card.oracle_id)

    owned = Enum.reduce(candidates, 0, &(&1.quantity + &2))

    allocated_elsewhere =
      other_allocations
      |> Map.values()
      |> Enum.sum()

    available =
      Enum.reduce(candidates, 0, fn item, total ->
        elsewhere = Map.get(other_allocations, item.id, 0)
        total + max(item.quantity - elsewhere, 0)
      end)

    %{
      state: collection_state(card, available, owned),
      required: 1,
      owned: owned,
      allocated: 0,
      available: available,
      allocated_elsewhere: allocated_elsewhere,
      missing: if(available > 0 or basic_land?(card), do: 0, else: 1),
      candidates:
        Enum.map(candidates, fn item ->
          elsewhere = Map.get(other_allocations, item.id, 0)

          %{
            item: item,
            allocated: 0,
            allocated_elsewhere: elsewhere,
            available: max(item.quantity - elsewhere, 0)
          }
        end)
    }
  end

  defp collection_status(_local_card, _deck_card) do
    %{
      state: "missing",
      required: 1,
      owned: 0,
      allocated: 0,
      available: 0,
      allocated_elsewhere: 0,
      missing: 1,
      candidates: []
    }
  end

  defp collection_state(_card, available, _owned) when available > 0, do: "available"
  defp collection_state(_card, _available, owned) when owned > 0, do: "partial"

  defp collection_state(%Card{} = card, _available, _owned),
    do: if(basic_land?(card), do: "basic_land", else: "missing")

  defp stringify_status(%{state: state} = status) do
    Map.put(status, :state, to_string(state))
  end

  defp deck_card_allocation_status(%DeckCard{} = deck_card) do
    deck_card =
      Repo.preload(deck_card, [:deck, :preferred_printing, card: [], deck_allocations: []])

    candidates = collection_candidates(deck_card.oracle_id, deck_card.finish)
    current_allocations = current_allocation_counts(deck_card.id)
    other_allocations = other_reserving_allocation_counts(deck_card)

    owned = Enum.reduce(candidates, 0, &(&1.quantity + &2))
    allocated = current_allocations |> Map.values() |> Enum.sum()
    allocated_elsewhere = other_allocations |> Map.values() |> Enum.sum()

    available =
      Enum.reduce(candidates, 0, fn item, total ->
        current = Map.get(current_allocations, item.id, 0)
        elsewhere = Map.get(other_allocations, item.id, 0)
        total + max(item.quantity - current - elsewhere, 0)
      end)

    missing =
      if basic_land?(deck_card.card) do
        0
      else
        max(deck_card.quantity - allocated - available, 0)
      end

    %{
      state: deck_card_state(deck_card, allocated, available, owned),
      required: deck_card.quantity,
      owned: owned,
      allocated: allocated,
      available: available,
      allocated_elsewhere: allocated_elsewhere,
      missing: missing,
      candidates:
        Enum.map(candidates, fn item ->
          current = Map.get(current_allocations, item.id, 0)
          elsewhere = Map.get(other_allocations, item.id, 0)

          %{
            item: item,
            allocated: current,
            allocated_elsewhere: elsewhere,
            available: max(item.quantity - current - elsewhere, 0)
          }
        end)
    }
  end

  defp deck_card_state(%DeckCard{} = deck_card, allocated, available, owned) do
    cond do
      allocated >= deck_card.quantity -> :allocated
      allocated + available >= deck_card.quantity -> :available
      basic_land?(deck_card.card) -> :basic_land
      allocated > 0 or owned > 0 -> :partial
      true -> :missing
    end
  end

  defp collection_candidates(oracle_id, finish \\ nil)

  defp collection_candidates(oracle_id, finish) when is_binary(oracle_id) do
    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:inner, [_item, printing], card in assoc(printing, :card))
    |> join(:left, [item, _printing, _card], location in assoc(item, :location_assoc))
    |> where([_item, printing, _card, _location], printing.oracle_id == ^oracle_id)
    |> maybe_filter_finish(finish)
    |> where([_item, _printing, _card, location], is_nil(location.id) or location.kind != "list")
    |> preload([_item, printing, card, location],
      printing: {printing, card: card},
      location_assoc: location
    )
    |> order_by([item, printing, card, _location],
      asc: card.name,
      asc: printing.set_code,
      asc: printing.collector_number,
      asc: item.id
    )
    |> Repo.all()
  end

  defp collection_candidates(_oracle_id, _finish), do: []

  defp maybe_filter_finish(query, nil), do: query
  defp maybe_filter_finish(query, finish), do: where(query, [item], item.finish == ^finish)

  defp current_allocation_counts(deck_card_id) do
    DeckAllocation
    |> where([allocation], allocation.deck_card_id == ^deck_card_id)
    |> group_by([allocation], allocation.collection_item_id)
    |> select([allocation], {allocation.collection_item_id, sum(allocation.quantity)})
    |> Repo.all()
    |> Map.new()
  end

  defp other_reserving_allocation_counts(%DeckCard{} = deck_card) do
    DeckAllocation
    |> join(:inner, [allocation], allocated_card in assoc(allocation, :deck_card))
    |> join(:inner, [_allocation, allocated_card], deck in assoc(allocated_card, :deck))
    |> where(
      [allocation, allocated_card, deck],
      deck.status == "active" and allocated_card.id != ^deck_card.id and
        allocated_card.oracle_id == ^deck_card.oracle_id and
        allocated_card.finish == ^deck_card.finish
    )
    |> group_by([allocation, _allocated_card, _deck], allocation.collection_item_id)
    |> select(
      [allocation, _allocated_card, _deck],
      {allocation.collection_item_id, sum(allocation.quantity)}
    )
    |> Repo.all()
    |> Map.new()
  end

  defp allocation_counts_for_oracle_id(oracle_id) do
    DeckAllocation
    |> join(:inner, [allocation], allocated_card in assoc(allocation, :deck_card))
    |> join(:inner, [_allocation, allocated_card], deck in assoc(allocated_card, :deck))
    |> where(
      [allocation, allocated_card, deck],
      deck.status == "active" and allocated_card.oracle_id == ^oracle_id
    )
    |> group_by([allocation, _allocated_card, _deck], allocation.collection_item_id)
    |> select(
      [allocation, _allocated_card, _deck],
      {allocation.collection_item_id, sum(allocation.quantity)}
    )
    |> Repo.all()
    |> Map.new()
  end

  defp local_card(identifier, name) when is_binary(identifier) and identifier != "" do
    local_card_by_oracle_id(identifier) ||
      local_card_by_printing_id(identifier) ||
      local_card_by_name(name)
  end

  defp local_card(_identifier, name), do: local_card_by_name(name)

  defp local_card_by_oracle_id(oracle_id) do
    case Repo.get(Card, oracle_id) do
      nil -> nil
      card -> preload_card(card)
    end
  end

  defp local_card_by_printing_id(scryfall_id) do
    case Repo.get(Printing, scryfall_id) do
      nil ->
        nil

      printing ->
        printing
        |> Repo.preload(:card)
        |> Map.get(:card)
        |> preload_card()
    end
  end

  defp local_card_by_name(name) do
    name = name |> to_string() |> String.trim() |> String.downcase()

    Card
    |> where([card], fragment("lower(?)", card.name) == ^name)
    |> limit(1)
    |> Repo.one()
    |> case do
      nil -> nil
      card -> preload_card(card)
    end
  end

  defp preload_card(%Card{} = card) do
    Repo.preload(card,
      printings: from(printing in Printing, order_by: [desc: printing.released_at])
    )
  end

  defp preload_card(_card), do: nil

  defp matching_deck_card(%Deck{} = deck, oracle_id, name) do
    deck.deck_cards
    |> Enum.reject(&(&1.zone == "maybeboard"))
    |> Enum.find(fn deck_card ->
      deck_card.oracle_id == oracle_id or
        normalize_name(deck_card.card.name) == normalize_name(name)
    end)
  end

  defp local_card_oracle_id(%Card{oracle_id: oracle_id}), do: oracle_id
  defp local_card_oracle_id(_card), do: nil

  defp entry_name(%{"name" => name}) when is_binary(name), do: name
  defp entry_name(%{name: name}) when is_binary(name), do: name
  defp entry_name(_entry), do: ""

  defp entry_oracle_id(%{"oracle_id" => oracle_id}) when is_binary(oracle_id), do: oracle_id
  defp entry_oracle_id(%{oracle_id: oracle_id}) when is_binary(oracle_id), do: oracle_id
  defp entry_oracle_id(_entry), do: nil

  defp entry_string(entry, key) do
    case Map.get(entry, key) || Map.get(entry, String.to_atom(key)) do
      value when is_binary(value) -> value
      _value -> nil
    end
  end

  defp entry_number(entry, key) do
    case Map.get(entry, key) || Map.get(entry, String.to_atom(key)) do
      value when is_integer(value) -> value
      value when is_float(value) -> value
      _value -> nil
    end
  end

  defp deck_card_line(%DeckCard{} = deck_card) do
    [
      "#{deck_card.quantity}x",
      deck_card.card.name,
      printing_label(deck_card.preferred_printing),
      finish_label(deck_card.finish)
    ]
    |> Enum.reject(&(&1 in [nil, ""]))
    |> Enum.join(" ")
  end

  defp printing_label(%Printing{} = printing) do
    "(#{String.upcase(printing.set_code || "")}) #{printing.collector_number}"
  end

  defp printing_label(_printing), do: nil

  defp finish_label("foil"), do: "*F*"
  defp finish_label("etched"), do: "*E*"
  defp finish_label(_finish), do: nil

  defp basic_land?(%Card{type_line: type_line}) when is_binary(type_line) do
    String.contains?(type_line, "Basic Land")
  end

  defp basic_land?(_card), do: false

  defp card_slug(name) do
    name
    |> String.downcase()
    |> String.replace(~r/['’,]/u, "")
    |> String.replace(~r/[^a-z0-9]+/u, "-")
    |> String.trim("-")
  end

  defp normalize_name(value) do
    value
    |> to_string()
    |> String.downcase()
    |> String.replace(~r/[^[:alnum:]]+/u, " ")
    |> String.trim()
  end

  defp zone_order("commander"), do: 0
  defp zone_order("mainboard"), do: 1
  defp zone_order("sideboard"), do: 2
  defp zone_order(_zone), do: 3

  defp deck_preloads do
    [
      deck_cards:
        {from(deck_card in DeckCard,
           join: card in assoc(deck_card, :card),
           left_join: preferred_printing in assoc(deck_card, :preferred_printing),
           order_by: [
             asc: deck_card.zone,
             asc: card.name,
             asc: deck_card.id
           ],
           preload: [
             card:
               {card,
                printings:
                  ^from(printing in Printing,
                    order_by: [desc: printing.released_at, asc: printing.set_code]
                  )},
             preferred_printing: preferred_printing
           ]
         ), []}
    ]
  end
end
