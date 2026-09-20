defmodule Manavault.Catalog.Collection.ReplaceAutoSortRules do
  @moduledoc false

  alias Manavault.Catalog.{AutoSortRule, Location}
  alias Manavault.Repo

  def run(inputs) when is_list(inputs) do
    Repo.transact(fn ->
      Repo.delete_all(AutoSortRule)

      with {:ok, rules} <- insert_rules(inputs) do
        {:ok, Repo.preload(rules, :target_location)}
      end
    end)
  end

  defp insert_rules(inputs) do
    inputs
    |> Enum.map(&rule_attrs/1)
    |> Enum.reduce_while({:ok, []}, fn attrs, {:ok, rules} ->
      with {:ok, _location} <- target_location(attrs),
           {:ok, rule} <- AutoSortRule.changeset(%AutoSortRule{}, attrs) |> Repo.insert() do
        {:cont, {:ok, [rule | rules]}}
      else
        {:error, reason} -> {:halt, {:error, reason}}
      end
    end)
    |> case do
      {:ok, rules} -> {:ok, Enum.reverse(rules)}
      error -> error
    end
  end

  defp rule_attrs(input) when is_map(input) do
    %{}
    |> put_rule_attr(input, :name)
    |> put_rule_attr(input, :enabled, true)
    |> put_rule_attr(input, :priority)
    |> put_rule_attr(input, :target_location_id)
    |> put_rule_attr(input, :color_mode, "any")
    |> put_rule_attr(input, :colors, [])
    |> put_rule_attr(input, :type_line_includes, [])
    |> put_rule_attr(input, :type_line_excludes, [])
    |> put_rule_attr(input, :rarities, [])
    |> put_rule_attr(input, :min_price_cents)
    |> put_rule_attr(input, :max_price_cents)
    |> put_rule_attr(input, :set_operator, "in")
    |> put_rule_attr(input, :set_codes, [])
    |> put_rule_attr(input, :release_date_operator, "after")
    |> put_rule_attr(input, :release_date)
  end

  defp put_rule_attr(map, input, field, default \\ nil) do
    value =
      case input_value(input, field) do
        {:ok, nil} -> default
        {:ok, value} -> value
        :error -> default
      end

    Map.put(map, field, value)
  end

  defp target_location(%{target_location_id: nil}), do: {:error, :auto_sort_target_not_found}

  defp target_location(%{target_location_id: id}) do
    case Repo.get(Location, id) do
      %Location{kind: kind} when kind in ["box", "binder"] -> {:ok, id}
      %Location{} -> {:error, :invalid_auto_sort_target}
      nil -> {:error, :auto_sort_target_not_found}
    end
  end

  defp target_location(_attrs), do: {:error, :auto_sort_target_not_found}

  defp input_value(input, field) do
    string_field = Atom.to_string(field)
    camel_field = snake_to_camel(string_field)

    cond do
      Map.has_key?(input, field) -> {:ok, Map.fetch!(input, field)}
      Map.has_key?(input, string_field) -> {:ok, Map.fetch!(input, string_field)}
      Map.has_key?(input, camel_field) -> {:ok, Map.fetch!(input, camel_field)}
      true -> :error
    end
  end

  defp snake_to_camel(value) do
    value
    |> String.split("_")
    |> then(fn [head | tail] -> head <> Enum.map_join(tail, "", &String.capitalize/1) end)
  end
end
