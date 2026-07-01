defmodule Manavault.Catalog.ScryfallOracleTags do
  @moduledoc false

  @type_themes [
    {"land", "land"},
    {"creature", "creature"},
    {"artifact", "artifact"},
    {"enchantment", "enchantment"},
    {"instant", "instant"},
    {"sorcery", "sorcery"},
    {"planeswalker", "planeswalker"}
  ]

  @theme_aliases %{
    "aristocrats" => "aristocrats",
    "artifact" => "artifact",
    "artifacts" => "artifact",
    "aura" => "auras",
    "auras" => "auras",
    "blink" => "blink",
    "blinks" => "blink",
    "board_wipe" => "board_wipe",
    "board_wipes" => "board_wipe",
    "burn" => "burn",
    "card_advantage" => "card_advantage",
    "card_advantages" => "card_advantage",
    "card_draw" => "card_advantage",
    "card_draws" => "card_advantage",
    "combo" => "combo",
    "copy" => "copy",
    "copies" => "copy",
    "counter" => "counters",
    "counters" => "counters",
    "creature" => "creature",
    "creatures" => "creature",
    "discard" => "discard",
    "drain" => "drain",
    "draw" => "card_advantage",
    "engine" => "engine",
    "enchantment" => "enchantment",
    "enchantments" => "enchantment",
    "equipment" => "equipment",
    "evasion" => "evasion",
    "finisher" => "win_condition",
    "finishers" => "win_condition",
    "flicker" => "blink",
    "flickers" => "blink",
    "flying" => "evasion",
    "graveyard_hate" => "graveyard_hate",
    "instant" => "instant",
    "instants" => "instant",
    "land" => "land",
    "land_ramp" => "ramp",
    "lands" => "land",
    "life_gain" => "lifegain",
    "lifegain" => "lifegain",
    "mana_ramp" => "ramp",
    "mass_removal" => "board_wipe",
    "mass_removals" => "board_wipe",
    "mill" => "mill",
    "planeswalker" => "planeswalker",
    "planeswalkers" => "planeswalker",
    "protection" => "protection",
    "pump" => "pump",
    "ramp" => "ramp",
    "recursion" => "recursion",
    "removal" => "removal",
    "sacrifice" => "sacrifice",
    "spot_removal" => "removal",
    "spellslinger" => "spellslinger",
    "stax" => "stax",
    "storm" => "storm",
    "sunforger" => "sunforger",
    "sorceries" => "sorcery",
    "sorcery" => "sorcery",
    "synergy" => "engine",
    "theft" => "theft",
    "tokens" => "tokens",
    "token" => "tokens",
    "tutor" => "tutor",
    "tutors" => "tutor",
    "voltron" => "voltron",
    "win_condition" => "win_condition",
    "win_conditions" => "win_condition"
  }

  @mass_disruption_themes MapSet.new(["board_wipe", "stax"])
  @targeted_disruption_themes MapSet.new(["discard", "graveyard_hate", "removal", "theft"])
  @scored_deck_categories [
    {"ramp", MapSet.new(["ramp"])},
    {"card_advantage", MapSet.new(["card_advantage"])},
    {"targeted_disruption", @targeted_disruption_themes}
  ]
  @category_theme_order %{
    "lands" => ["land"],
    "mass_disruption" => ["board_wipe", "stax"],
    "ramp" => ["ramp"],
    "card_advantage" => ["card_advantage"],
    "targeted_disruption" => ["removal", "discard", "graveyard_hate", "theft"]
  }

  def build_index(%{"data" => tags}) when is_list(tags), do: build_index(tags)

  def build_index(tags) when is_list(tags) do
    tags_by_id = Map.new(tags, fn tag -> {value(tag, "id"), tag} end)

    tags
    |> Enum.flat_map(&selected_taggings(&1, tags_by_id))
    |> Enum.group_by(& &1.oracle_id)
    |> Map.new(fn {oracle_id, entries} ->
      entries =
        entries
        |> Enum.uniq_by(& &1.tag.id)
        |> Enum.sort_by(&{&1.tag.slug || "", &1.tag.id || ""})

      {oracle_id, entries}
    end)
  end

  def build_index(_tags), do: %{}

  def fields_for_card(card, tag_index \\ %{}) when is_map(card) and is_map(tag_index) do
    oracle_id = value(card, "oracle_id")
    tag_entries = Map.get(tag_index, oracle_id, [])
    type_themes = type_themes(value(card, "type_line"))

    deck_category = deck_category(type_themes, tag_entries)

    themes =
      tag_entries
      |> Enum.flat_map(& &1.themes)
      |> unique_append(type_themes)
      |> prioritize_themes(deck_category)

    %{
      oracle_tags: Jason.encode!(Enum.map(tag_entries, & &1.tag)),
      deck_category: deck_category,
      deck_themes: Jason.encode!(themes)
    }
  end

  defp selected_taggings(tag, tags_by_id) when is_map(tag) do
    themes = tag_themes(tag, tags_by_id)

    if oracle_tag?(tag) and themes != [] do
      taggings = value(tag, "taggings") || []

      taggings
      |> Enum.filter(&oracle_tagging?/1)
      |> Enum.map(fn tagging ->
        %{
          oracle_id: value(tagging, "oracle_id"),
          themes: themes,
          tag: %{
            id: value(tag, "id"),
            slug: value(tag, "slug"),
            label: value(tag, "label"),
            weight: value(tagging, "weight"),
            annotation: value(tagging, "annotation")
          }
        }
      end)
    else
      []
    end
  end

  defp selected_taggings(_tag, _tags_by_id), do: []

  defp oracle_tag?(tag) do
    tag
    |> value("type")
    |> normalize_theme_name()
    |> Kernel.in(["oracle", "function", "functional"])
  end

  defp oracle_tagging?(tagging) when is_map(tagging) do
    is_binary(value(tagging, "oracle_id")) and is_nil(value(tagging, "illustration_id"))
  end

  defp oracle_tagging?(_tagging), do: false

  defp tag_themes(tag, tags_by_id) do
    tag
    |> tag_themes(tags_by_id, MapSet.new())
    |> Enum.uniq()
  end

  defp tag_themes(tag, tags_by_id, visited_ids) do
    tag_id = value(tag, "id")

    if is_binary(tag_id) and MapSet.member?(visited_ids, tag_id) do
      []
    else
      visited_ids = if is_binary(tag_id), do: MapSet.put(visited_ids, tag_id), else: visited_ids
      parent_ids = List.wrap(value(tag, "parent_ids"))

      own_tag_themes(tag) ++
        Enum.flat_map(parent_ids, fn parent_id ->
          case Map.fetch(tags_by_id, parent_id) do
            {:ok, parent} -> tag_themes(parent, tags_by_id, visited_ids)
            :error -> []
          end
        end)
    end
  end

  defp own_tag_themes(tag) do
    [value(tag, "slug"), value(tag, "label") | List.wrap(value(tag, "aliases"))]
    |> Enum.flat_map(fn name ->
      normalized = normalize_theme_name(name)

      case Map.fetch(@theme_aliases, normalized) do
        {:ok, theme} -> [theme]
        :error -> []
      end
    end)
  end

  defp type_themes(type_line) when is_binary(type_line) do
    normalized = normalize_theme_name(type_line)
    words = String.split(normalized, "_", trim: true)

    @type_themes
    |> Enum.flat_map(fn {word, theme} ->
      if word in words, do: [theme], else: []
    end)
  end

  defp type_themes(_type_line), do: []

  defp deck_category(type_themes, tag_entries) do
    cond do
      "land" in type_themes -> "lands"
      category_count(tag_entries, @mass_disruption_themes) > 0 -> "mass_disruption"
      true -> most_represented_category(tag_entries)
    end
  end

  defp most_represented_category(tag_entries) do
    @scored_deck_categories
    |> Enum.reduce({"other", 0}, fn {category, category_themes}, {best_category, best_count} ->
      count = category_count(tag_entries, category_themes)

      if count > best_count do
        {category, count}
      else
        {best_category, best_count}
      end
    end)
    |> elem(0)
  end

  defp category_count(tag_entries, category_themes) do
    Enum.count(tag_entries, fn %{themes: themes} ->
      Enum.any?(themes, &MapSet.member?(category_themes, &1))
    end)
  end

  defp prioritize_themes(themes, deck_category) do
    preferred_themes = Map.get(@category_theme_order, deck_category, [])

    preferred =
      Enum.filter(preferred_themes, fn theme ->
        theme in themes
      end)

    preferred ++ Enum.reject(themes, &(&1 in preferred))
  end

  defp unique_append(values, more_values) do
    (values ++ more_values)
    |> Enum.reject(&is_nil/1)
    |> Enum.uniq()
  end

  defp value(map, key) do
    Map.get(map, key) || Map.get(map, String.to_existing_atom(key))
  rescue
    ArgumentError -> Map.get(map, key)
  end

  defp normalize_theme_name(value) when is_binary(value) do
    value
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9]+/u, "_")
    |> String.trim("_")
  end

  defp normalize_theme_name(_value), do: ""
end
