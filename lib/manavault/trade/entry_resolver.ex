defmodule Manavault.Trade.EntryResolver do
  @moduledoc """
  Resolves `Manavault.Trade.ListSource` entries to catalog oracle ids by
  exact, normalized card name (`Manavault.Catalog.Search.CardsByName`).
  Split/adventure names ("A // B") are tried by their full name first, then
  by the front face alone, so a source that lists only the front face still
  resolves to the combined card.
  """

  alias Manavault.Catalog.Card
  alias Manavault.Catalog.Search.CardsByName

  @doc """
  Adds an `:oracle_id` (possibly `nil`) to every entry. Returns
  `{:ok, %{entries: [map()], unrecognized: [String.t()]}}`, where
  `unrecognized` is the deduped list of names that didn't resolve.
  """
  def resolve(entries) when is_list(entries) do
    cards_by_name = cards_by_normalized_name(entries)

    resolved_entries =
      Enum.map(entries, fn entry ->
        Map.put(entry, :oracle_id, find_oracle_id(entry, cards_by_name))
      end)

    unrecognized =
      resolved_entries
      |> Enum.filter(&is_nil(&1.oracle_id))
      |> Enum.map(& &1.name)
      |> Enum.uniq()

    {:ok, %{entries: resolved_entries, unrecognized: unrecognized}}
  end

  defp find_oracle_id(%{name: name}, cards_by_name) do
    case Map.get(cards_by_name, CardsByName.key(name)) || fallback_card(name, cards_by_name) do
      %Card{oracle_id: oracle_id} -> oracle_id
      nil -> nil
    end
  end

  defp fallback_card(name, cards_by_name) do
    case front_face(name) do
      nil -> nil
      front -> Map.get(cards_by_name, CardsByName.key(front))
    end
  end

  defp front_face(name) do
    case String.split(name, ~r{\s*//\s*}, parts: 2) do
      [front, _back] -> front
      _no_split -> nil
    end
  end

  defp cards_by_normalized_name(entries) do
    entries
    |> Enum.flat_map(&entry_names/1)
    |> CardsByName.by_names()
  end

  defp entry_names(%{name: name}) do
    case front_face(name) do
      nil -> [name]
      front -> [name, front]
    end
  end
end
