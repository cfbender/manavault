defmodule Manavault.Trade.EntryResolver do
  @moduledoc """
  Resolves `Manavault.Trade.ListSource` entries to catalog oracle ids by
  exact, normalized card name — mirroring
  `Manavault.Catalog.Decks.DecklistIO`. Split/adventure names ("A // B") are
  tried by their full name first, then by the front face alone, so a source
  that lists only the front face still resolves to the combined card.
  """

  import Ecto.Query

  alias Manavault.Catalog.{Card, Decklists}
  alias Manavault.Repo

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
    case Map.get(cards_by_name, key(name)) || fallback_card(name, cards_by_name) do
      %Card{oracle_id: oracle_id} -> oracle_id
      nil -> nil
    end
  end

  defp fallback_card(name, cards_by_name) do
    case front_face(name) do
      nil -> nil
      front -> Map.get(cards_by_name, key(front))
    end
  end

  defp front_face(name) do
    case String.split(name, ~r{\s*//\s*}, parts: 2) do
      [front, _back] -> front
      _no_split -> nil
    end
  end

  defp cards_by_normalized_name(entries) do
    keys =
      entries
      |> Enum.flat_map(&entry_keys/1)
      |> Enum.reject(&(&1 == ""))
      |> Enum.uniq()

    Card
    |> where([card], fragment("lower(?)", card.name) in ^keys)
    |> Repo.all()
    |> Map.new(&{key(&1.name), &1})
  end

  defp entry_keys(%{name: name}) do
    case front_face(name) do
      nil -> [key(name)]
      front -> [key(name), key(front)]
    end
  end

  defp key(name) when is_binary(name),
    do: name |> Decklists.normalize_card_name() |> String.downcase()

  defp key(_name), do: ""
end
