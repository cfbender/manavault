defmodule Manavault.Catalog.EDHRec.Response.CommanderPage do
  @moduledoc false

  alias Manavault.Catalog.EDHRec.Response.{CardLookup, CollectionStatus}

  def pages(names, fetch_commander_page, deck \\ nil) do
    names
    |> Enum.uniq()
    |> Enum.map(fn name ->
      case fetch_commander_page.(name) do
        {:ok, page} when is_map(page) -> normalize(name, page, deck)
        _error -> nil
      end
    end)
    |> Enum.reject(&is_nil/1)
  end

  defp normalize(name, page, deck) do
    container = Map.get(page, "container", %{})
    json_dict = Map.get(container, "json_dict", %{})
    card = Map.get(json_dict, "card", %{})

    %{
      name: page_value(card, "name") || name,
      title: page_value(page, "title") || page_value(page, "header") || name,
      description:
        page_value(container, "description") || page_value(page, "description") ||
          "EDHREC commander data",
      url: "https://edhrec.com/commanders/#{CardLookup.card_slug(name)}",
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
        |> normalize_sections(deck)
    }
  end

  defp normalize_sections(cardlists, deck) when is_list(cardlists) do
    cardlists
    |> Enum.map(&normalize_section(&1, deck))
    |> Enum.reject(&is_nil/1)
  end

  defp normalize_sections(_cardlists, _deck), do: []

  defp normalize_section(%{} = section, deck) do
    cards =
      section
      |> Map.get("cardviews", [])
      |> Enum.map(&normalize_card(&1, deck))
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

  defp normalize_section(_section, _deck), do: nil

  defp normalize_card(%{} = entry, deck) do
    name = CardLookup.entry_name(entry)

    if name == "" do
      nil
    else
      local_card =
        CardLookup.local_card(page_value(entry, "oracle_id") || page_value(entry, "id"), name)

      oracle_id = CardLookup.local_card_oracle_id(local_card)
      deck_card = matching_deck_card(deck, oracle_id, name)

      %{
        name: name,
        oracle_id: oracle_id,
        synergy: page_number(entry, "synergy"),
        inclusion: page_integer(entry, "inclusion"),
        num_decks: page_integer(entry, "num_decks"),
        potential_decks: page_integer(entry, "potential_decks"),
        url:
          edhrec_path(
            page_value(entry, "url"),
            "https://edhrec.com/cards/#{CardLookup.card_slug(name)}"
          ),
        card: local_card,
        collection_status: CollectionStatus.status(local_card, deck_card)
      }
    end
  end

  defp normalize_card(_entry, _deck), do: nil

  defp matching_deck_card(nil, _oracle_id, _name), do: nil

  defp matching_deck_card(deck, oracle_id, name),
    do: CardLookup.matching_deck_card(deck, oracle_id, name)

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
end
