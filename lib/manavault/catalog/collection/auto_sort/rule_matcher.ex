defmodule Manavault.Catalog.Collection.AutoSort.RuleMatcher do
  @moduledoc false

  alias Manavault.Catalog.{Card, CollectionItem, Location, Price, Util}

  @colors ~w(W U B R G)

  def matching_rule(rules, item), do: Enum.find(rules, &matches?(&1, item))

  def move_summary(item, rule) do
    {from_location_id, from_location_name} = source_location(item)

    %{
      collection_item_id: item.id,
      card_name: card_value(item, :name),
      card_id: card_value(item, :oracle_id),
      set_code: printing_value(item, :set_code),
      collector_number: printing_value(item, :collector_number),
      image_url: printing_image_url(item),
      quantity: item.quantity,
      finish: item.finish,
      from_location_id: from_location_id,
      from_location_name: from_location_name,
      to_location_id: rule.location_id,
      to_location_name: rule.location_name
    }
  end

  defp matches?(rule, item) do
    color_matches?(rule, item) and type_matches?(rule, item) and rarity_matches?(rule, item) and
      price_matches?(rule, item) and set_matches?(rule, item) and
      release_date_matches?(rule, item)
  end

  defp color_matches?(%{color_mode: "any"}, _item), do: true
  defp color_matches?(%{color_mode: "colorless"}, item), do: item_colors(item) == []
  defp color_matches?(%{color_mode: "multicolor"}, item), do: length(item_colors(item)) > 1

  defp color_matches?(%{color_mode: "include_any", colors: colors}, item) do
    colors = normalize_colors(colors)
    colors == [] or not MapSet.disjoint?(MapSet.new(item_colors(item)), MapSet.new(colors))
  end

  defp color_matches?(%{color_mode: "include_all", colors: colors}, item) do
    MapSet.subset?(MapSet.new(normalize_colors(colors)), MapSet.new(item_colors(item)))
  end

  defp color_matches?(%{color_mode: "exact", colors: colors}, item) do
    MapSet.equal?(MapSet.new(normalize_colors(colors)), MapSet.new(item_colors(item)))
  end

  defp color_matches?(_rule, _item), do: false

  defp type_matches?(rule, item) do
    type_line = item |> card_value(:type_line) |> Card.sorting_type_line() |> String.downcase()

    includes? =
      Enum.all?(rule.type_line_includes, &String.contains?(type_line, String.downcase(&1)))

    excludes? =
      Enum.any?(rule.type_line_excludes, &String.contains?(type_line, String.downcase(&1)))

    includes? and not excludes?
  end

  defp rarity_matches?(%{rarities: []}, _item), do: true

  defp rarity_matches?(rule, item) do
    rarity = item |> printing_value(:rarity) |> to_string() |> String.downcase()
    rarity in Enum.map(rule.rarities, &String.downcase/1)
  end

  defp price_matches?(%{min_price_cents: nil, max_price_cents: nil}, _item), do: true

  defp price_matches?(rule, item) do
    case Price.collection_item_price_cents(item) do
      price when is_integer(price) ->
        (is_nil(rule.min_price_cents) or price >= rule.min_price_cents) and
          (is_nil(rule.max_price_cents) or price <= rule.max_price_cents)

      _missing ->
        false
    end
  end

  defp set_matches?(%{set_codes: []}, _item), do: true

  defp set_matches?(%{set_operator: "in", set_codes: set_codes}, item) do
    normalized_set_code(printing_value(item, :set_code)) in normalized_set_codes(set_codes)
  end

  defp set_matches?(%{set_operator: "not_in", set_codes: set_codes}, item) do
    normalized_set_code(printing_value(item, :set_code)) not in normalized_set_codes(set_codes)
  end

  defp set_matches?(_rule, _item), do: false

  defp release_date_matches?(%{release_date: nil}, _item), do: true

  defp release_date_matches?(%{release_date_operator: "before", release_date: threshold}, item) do
    case printing_release_date(item) do
      %Date{} = released_at -> Date.compare(released_at, threshold) == :lt
      nil -> false
    end
  end

  defp release_date_matches?(%{release_date_operator: "after", release_date: threshold}, item) do
    case printing_release_date(item) do
      %Date{} = released_at -> Date.compare(released_at, threshold) == :gt
      nil -> false
    end
  end

  defp release_date_matches?(_rule, _item), do: false

  defp source_location(%CollectionItem{location_assoc: %Location{} = location}),
    do: {location.id, location.name}

  defp source_location(%CollectionItem{location_id: nil}), do: {nil, "Unfiled"}
  defp source_location(%CollectionItem{location_id: location_id}), do: {location_id, nil}

  defp normalized_set_codes(values) do
    values |> normalized_strings() |> Enum.map(&normalized_set_code/1) |> Enum.reject(&(&1 == ""))
  end

  defp normalized_set_code(value), do: value |> to_string() |> String.trim() |> String.downcase()

  defp printing_release_date(item), do: item |> printing_value(:released_at) |> date_value()
  defp date_value(%Date{} = date), do: date

  defp date_value(value) when is_binary(value) do
    case Date.from_iso8601(value) do
      {:ok, date} -> date
      {:error, _reason} -> nil
    end
  end

  defp date_value(_value), do: nil

  defp normalize_colors(colors) do
    colors |> normalized_strings() |> Enum.map(&String.upcase/1) |> Enum.filter(&(&1 in @colors))
  end

  defp item_colors(item) do
    colors = item |> card_value(:colors) |> decode_list() |> normalize_colors()

    if colors == [] and face_card?(item) do
      item |> card_value(:color_identity) |> decode_list() |> normalize_colors()
    else
      colors
    end
  end

  defp face_card?(item), do: item |> card_value(:name) |> to_string() |> String.contains?(" // ")
  defp normalized_strings(values), do: Enum.filter(List.wrap(values), &is_binary/1)
  defp decode_list(value) when is_list(value), do: normalized_strings(value)
  defp decode_list(value), do: value |> Util.decode_json([]) |> normalized_strings()
  defp card_value(%CollectionItem{printing: %{card: card}}, field), do: Map.get(card, field)
  defp card_value(_item, _field), do: nil

  defp printing_image_url(item) do
    item |> printing_value(:image_uris) |> Util.decode_json(%{}) |> image_url()
  end

  defp image_url(%{} = uris), do: uris["normal"] || uris["large"] || uris["small"] || uris["png"]
  defp image_url([first | _rest]), do: image_url(first)
  defp image_url(_uris), do: nil
  defp printing_value(%CollectionItem{printing: printing}, field), do: Map.get(printing, field)
  defp printing_value(_item, _field), do: nil
end
