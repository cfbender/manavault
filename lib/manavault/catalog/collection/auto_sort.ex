defmodule Manavault.Catalog.Collection.AutoSort do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{AutoSortRule, CollectionItem, Location, Price, Util}
  alias Manavault.Repo

  @colors ~w(W U B R G)

  def run(opts \\ []) when is_list(opts) do
    dry_run? = Keyword.get(opts, :dry_run, false) == true

    with {:ok, query} <- item_query(opts),
         {:ok, rules} <- auto_sort_rules(opts) do
      Repo.transact(fn ->
        items = Repo.all(query)
        result = Enum.reduce(items, empty_result(dry_run?), &sort_item(&1, &2, rules, dry_run?))

        {:ok, %{result | checked_count: length(items), moves: Enum.reverse(result.moves)}}
      end)
    end
  end

  defp item_query(opts) do
    cond do
      Keyword.has_key?(opts, :item_ids) ->
        ids = opts |> Keyword.get(:item_ids) |> List.wrap()

        {:ok,
         base_item_query()
         |> where([item], item.id in ^ids)}

      Keyword.get(opts, :source_location_id) == "unfiled" ->
        {:ok,
         base_item_query()
         |> where([item], is_nil(item.location_id))}

      is_nil(Keyword.get(opts, :source_location_id)) ->
        {:ok,
         base_item_query()
         |> where([location: location], is_nil(location.id) or location.kind != "list")}

      true ->
        source_location_id = Keyword.get(opts, :source_location_id)

        case normalize_location_id(source_location_id) do
          {:ok, location_id} ->
            {:ok,
             base_item_query()
             |> where([item], item.location_id == ^location_id)}

          :error ->
            {:error, :location_not_found}
        end
    end
  end

  defp base_item_query do
    from(item in CollectionItem,
      join: printing in assoc(item, :printing),
      join: card in assoc(printing, :card),
      left_join: location in assoc(item, :location_assoc),
      as: :location,
      preload: [printing: {printing, card: card}, location_assoc: location],
      order_by: [asc: item.id]
    )
  end

  defp enabled_rules do
    AutoSortRule
    |> join(:inner, [rule], location in assoc(rule, :target_location))
    |> where([rule, location], rule.enabled == true and location.kind in ["box", "binder"])
    |> order_by([rule], asc: rule.priority, asc: rule.id)
    |> preload([rule, location], target_location: location)
    |> Repo.all()
    |> Enum.map(&decode_rule/1)
  end

  defp auto_sort_rules(opts) do
    case Keyword.get(opts, :rules) do
      rules when is_list(rules) -> input_rules(rules)
      _rules -> {:ok, enabled_rules()}
    end
  end

  defp input_rules(rules) do
    normalized_rules =
      rules
      |> Enum.with_index()
      |> Enum.filter(fn {rule, _index} -> rule_value(rule, :enabled, false) == true end)
      |> Enum.sort_by(fn {rule, index} -> {rule_value(rule, :priority, index + 1), index} end)
      |> Enum.reduce_while({:ok, []}, fn {rule, _index}, {:ok, normalized} ->
        case normalize_input_rule(rule) do
          {:ok, normalized_rule} -> {:cont, {:ok, [normalized_rule | normalized]}}
          :error -> {:halt, {:error, :auto_sort_target_not_found}}
        end
      end)

    with {:ok, normalized_rules} <- normalized_rules do
      normalized_rules = Enum.reverse(normalized_rules)
      locations_by_id = locations_by_id(normalized_rules)

      rules =
        normalized_rules
        |> Enum.map(&decode_input_rule(&1, locations_by_id))
        |> Enum.reject(&is_nil/1)

      if length(rules) == length(normalized_rules) do
        {:ok, rules}
      else
        {:error, :auto_sort_target_not_found}
      end
    end
  end

  defp normalize_input_rule(rule) do
    with {:ok, location_id} <- normalize_location_id(rule_value(rule, :target_location_id)) do
      {:ok, Map.put(rule, :target_location_id, location_id)}
    end
  end

  defp locations_by_id(rules) do
    location_ids = rules |> Enum.map(& &1.target_location_id) |> Enum.uniq()

    Location
    |> where([location], location.id in ^location_ids and location.kind in ["box", "binder"])
    |> Repo.all()
    |> Map.new(&{&1.id, &1})
  end

  defp decode_input_rule(rule, locations_by_id) do
    case Map.fetch(locations_by_id, rule.target_location_id) do
      {:ok, location} ->
        %{
          location_id: location.id,
          location_name: location.name,
          color_mode: rule_value(rule, :color_mode, "any") || "any",
          colors: decode_list(rule_value(rule, :colors, [])),
          type_line_includes:
            normalized_strings(decode_list(rule_value(rule, :type_line_includes, []))),
          type_line_excludes:
            normalized_strings(decode_list(rule_value(rule, :type_line_excludes, []))),
          rarities: normalized_strings(decode_list(rule_value(rule, :rarities, []))),
          min_price_cents: rule_value(rule, :min_price_cents),
          max_price_cents: rule_value(rule, :max_price_cents)
        }

      :error ->
        nil
    end
  end

  defp sort_item(item, result, rules, dry_run?) do
    case Enum.find(rules, &matches?(&1, item)) do
      nil ->
        update_in(result.skipped_count, &(&1 + 1))

      %{location_id: location_id} when location_id == item.location_id ->
        update_in(result.skipped_count, &(&1 + 1))

      rule ->
        unless dry_run? do
          item
          |> CollectionItem.update_changeset(%{location_id: rule.location_id})
          |> Repo.update!()
        end

        result
        |> update_in([:moved_count], &(&1 + 1))
        |> update_in([:moves], &[move_summary(item, rule) | &1])
    end
  end

  defp matches?(rule, item) do
    color_matches?(rule, item) and type_matches?(rule, item) and rarity_matches?(rule, item) and
      price_matches?(rule, item)
  end

  defp color_matches?(%{color_mode: "any"}, _item), do: true

  defp color_matches?(%{color_mode: "colorless"}, item), do: item_colors(item) == []

  defp color_matches?(%{color_mode: "multicolor"}, item), do: length(item_colors(item)) > 1

  defp color_matches?(%{color_mode: "include_any", colors: colors}, item) do
    colors = normalize_colors(colors)
    colors == [] or not MapSet.disjoint?(MapSet.new(item_colors(item)), MapSet.new(colors))
  end

  defp color_matches?(%{color_mode: "include_all", colors: colors}, item) do
    colors = normalize_colors(colors)
    MapSet.subset?(MapSet.new(colors), MapSet.new(item_colors(item)))
  end

  defp color_matches?(%{color_mode: "exact", colors: colors}, item) do
    MapSet.equal?(MapSet.new(normalize_colors(colors)), MapSet.new(item_colors(item)))
  end

  defp color_matches?(_rule, _item), do: false

  defp type_matches?(rule, item) do
    type_line =
      item
      |> card_value(:type_line)
      |> to_string()
      |> String.downcase()

    includes? =
      Enum.all?(rule.type_line_includes, &String.contains?(type_line, String.downcase(&1)))

    excludes? =
      Enum.any?(rule.type_line_excludes, &String.contains?(type_line, String.downcase(&1)))

    includes? and not excludes?
  end

  defp rarity_matches?(%{rarities: []}, _item), do: true

  defp rarity_matches?(rule, item) do
    rarity =
      item
      |> printing_value(:rarity)
      |> to_string()
      |> String.downcase()

    rarity in Enum.map(rule.rarities, &String.downcase/1)
  end

  defp price_matches?(%{min_price_cents: nil, max_price_cents: nil}, _item), do: true

  defp price_matches?(rule, item) do
    case Price.collection_item_price_cents(item) do
      price when is_integer(price) ->
        min_ok? = is_nil(rule.min_price_cents) or price >= rule.min_price_cents
        max_ok? = is_nil(rule.max_price_cents) or price <= rule.max_price_cents
        min_ok? and max_ok?

      _missing ->
        false
    end
  end

  defp decode_rule(%AutoSortRule{target_location: %Location{} = location} = rule) do
    %{
      location_id: location.id,
      location_name: location.name,
      color_mode: rule.color_mode || "any",
      colors: AutoSortRule.list_field(rule, :colors),
      type_line_includes: normalized_strings(AutoSortRule.list_field(rule, :type_line_includes)),
      type_line_excludes: normalized_strings(AutoSortRule.list_field(rule, :type_line_excludes)),
      rarities: normalized_strings(AutoSortRule.list_field(rule, :rarities)),
      min_price_cents: rule.min_price_cents,
      max_price_cents: rule.max_price_cents
    }
  end

  defp move_summary(item, rule) do
    {from_location_id, from_location_name} = source_location(item)

    %{
      collection_item_id: item.id,
      card_name: card_value(item, :name),
      card_id: card_value(item, :oracle_id),
      image_url: printing_image_url(item),
      quantity: item.quantity,
      from_location_id: from_location_id,
      from_location_name: from_location_name,
      to_location_id: rule.location_id,
      to_location_name: rule.location_name
    }
  end

  defp source_location(%CollectionItem{location_assoc: %Location{} = location}) do
    {location.id, location.name}
  end

  defp source_location(%CollectionItem{location_id: nil}), do: {nil, "Unfiled"}

  defp source_location(%CollectionItem{location_id: location_id}) do
    {location_id, nil}
  end

  defp decode_list(value) when is_list(value), do: normalized_strings(value)

  defp decode_list(value), do: value |> Util.decode_json([]) |> normalized_strings()

  defp normalized_strings(values) do
    values
    |> List.wrap()
    |> Enum.filter(&is_binary/1)
  end

  defp normalize_colors(colors) do
    colors
    |> normalized_strings()
    |> Enum.map(&String.upcase/1)
    |> Enum.filter(&(&1 in @colors))
  end

  defp item_colors(item) do
    colors =
      item
      |> card_value(:colors)
      |> decode_list()
      |> normalize_colors()

    if colors == [] and face_card?(item) do
      item
      |> card_value(:color_identity)
      |> decode_list()
      |> normalize_colors()
    else
      colors
    end
  end

  defp face_card?(item) do
    item
    |> card_value(:name)
    |> to_string()
    |> String.contains?(" // ")
  end

  defp card_value(%CollectionItem{printing: %{card: card}}, field), do: Map.get(card, field)
  defp card_value(_item, _field), do: nil

  defp printing_image_url(item) do
    item
    |> printing_value(:image_uris)
    |> decode_list_or_map()
    |> image_url()
  end

  defp decode_list_or_map(value) do
    Util.decode_json(value, %{})
  end

  defp image_url(%{} = image_uris) do
    image_uris["normal"] || image_uris["large"] || image_uris["small"] || image_uris["png"]
  end

  defp image_url([first | _rest]), do: image_url(first)
  defp image_url(_image_uris), do: nil
  defp printing_value(%CollectionItem{printing: printing}, field), do: Map.get(printing, field)
  defp printing_value(_item, _field), do: nil

  defp rule_value(rule, field, default \\ nil) do
    case fetch_rule_value(rule, field) do
      {:ok, value} -> value
      :error -> default
    end
  end

  defp fetch_rule_value(rule, field) do
    string_field = Atom.to_string(field)
    camel_field = snake_to_camel(string_field)

    cond do
      Map.has_key?(rule, field) -> {:ok, Map.fetch!(rule, field)}
      Map.has_key?(rule, string_field) -> {:ok, Map.fetch!(rule, string_field)}
      Map.has_key?(rule, camel_field) -> {:ok, Map.fetch!(rule, camel_field)}
      true -> :error
    end
  end

  defp snake_to_camel(value) do
    value
    |> String.split("_")
    |> then(fn [head | tail] -> head <> Enum.map_join(tail, "", &String.capitalize/1) end)
  end

  defp normalize_location_id(location_id) when is_integer(location_id), do: {:ok, location_id}

  defp normalize_location_id(location_id) when is_binary(location_id) do
    case Integer.parse(location_id) do
      {id, ""} -> {:ok, id}
      _invalid -> :error
    end
  end

  defp normalize_location_id(_location_id), do: :error

  defp empty_result(dry_run?),
    do: %{checked_count: 0, moved_count: 0, skipped_count: 0, dry_run: dry_run?, moves: []}
end
