defmodule Manavault.Catalog.Collection.AutoSort.Rules do
  @moduledoc false

  alias Manavault.Catalog.{AutoSortRule, Location}
  alias Manavault.Catalog.Collection.AutoSort.Query

  def load(opts) do
    case Keyword.get(opts, :rules) do
      rules when is_list(rules) -> input_rules(rules)
      _rules -> {:ok, Enum.map(Query.enabled_rules(), &decode_rule/1)}
    end
  end

  defp input_rules(rules) do
    with {:ok, normalized_rules} <- normalize_input_rules(rules) do
      locations_by_id =
        normalized_rules
        |> Enum.map(& &1.target_location_id)
        |> Enum.uniq()
        |> Query.locations_by_id()

      decoded_rules = Enum.map(normalized_rules, &decode_input_rule(&1, locations_by_id))

      if Enum.all?(decoded_rules, & &1) do
        {:ok, decoded_rules}
      else
        {:error, :auto_sort_target_not_found}
      end
    end
  end

  defp normalize_input_rules(rules) do
    rules
    |> Enum.with_index()
    |> Enum.filter(fn {rule, _index} -> value(rule, :enabled, false) == true end)
    |> Enum.sort_by(fn {rule, index} -> {value(rule, :priority, index + 1), index} end)
    |> Enum.reduce_while({:ok, []}, fn {rule, _index}, {:ok, normalized} ->
      case normalize_input_rule(rule) do
        {:ok, normalized_rule} -> {:cont, {:ok, [normalized_rule | normalized]}}
        {:error, reason} -> {:halt, {:error, reason}}
      end
    end)
    |> case do
      {:ok, normalized} -> {:ok, Enum.reverse(normalized)}
      error -> error
    end
  end

  defp normalize_input_rule(rule) do
    with {:ok, location_id} <- normalize_location_id(value(rule, :target_location_id)),
         {:ok, release_date} <- normalize_release_date(value(rule, :release_date)) do
      {:ok,
       rule
       |> Map.put(:target_location_id, location_id)
       |> Map.put(:release_date, release_date)}
    else
      :error -> {:error, :auto_sort_target_not_found}
      {:error, reason} -> {:error, reason}
    end
  end

  defp decode_input_rule(rule, locations_by_id) do
    case Map.fetch(locations_by_id, rule.target_location_id) do
      {:ok, location} ->
        rule_map(rule, location)

      :error ->
        nil
    end
  end

  defp decode_rule(%AutoSortRule{target_location: %Location{} = location} = rule) do
    rule_map(rule, location)
  end

  defp rule_map(rule, location) do
    %{
      location_id: location.id,
      location_name: location.name,
      color_mode: value(rule, :color_mode, "any") || "any",
      colors: list_value(rule, :colors),
      type_line_includes: list_value(rule, :type_line_includes),
      type_line_excludes: list_value(rule, :type_line_excludes),
      rarities: list_value(rule, :rarities),
      min_price_cents: value(rule, :min_price_cents),
      max_price_cents: value(rule, :max_price_cents),
      set_operator: value(rule, :set_operator, "in") || "in",
      set_codes: list_value(rule, :set_codes),
      release_date_operator: value(rule, :release_date_operator, "after") || "after",
      release_date: value(rule, :release_date)
    }
  end

  defp list_value(%AutoSortRule{} = rule, field), do: AutoSortRule.list_field(rule, field)
  defp list_value(rule, field), do: rule |> value(field, []) |> decode_list()

  defp decode_list(value) when is_list(value), do: normalized_strings(value)

  defp decode_list(value) do
    case Jason.decode(value || "") do
      {:ok, decoded} when is_list(decoded) -> normalized_strings(decoded)
      _invalid -> []
    end
  end

  defp normalized_strings(values), do: Enum.filter(List.wrap(values), &is_binary/1)

  defp normalize_release_date(nil), do: {:ok, nil}
  defp normalize_release_date(""), do: {:ok, nil}
  defp normalize_release_date(%Date{} = date), do: {:ok, date}

  defp normalize_release_date(value) when is_binary(value) do
    case Date.from_iso8601(value) do
      {:ok, date} -> {:ok, date}
      {:error, _reason} -> {:error, :invalid_auto_sort_rule}
    end
  end

  defp normalize_release_date(_value), do: {:error, :invalid_auto_sort_rule}

  defp value(rule, field, default \\ nil) do
    string_field = Atom.to_string(field)
    camel_field = snake_to_camel(string_field)

    cond do
      Map.has_key?(rule, field) -> Map.fetch!(rule, field)
      Map.has_key?(rule, string_field) -> Map.fetch!(rule, string_field)
      Map.has_key?(rule, camel_field) -> Map.fetch!(rule, camel_field)
      true -> default
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
end
