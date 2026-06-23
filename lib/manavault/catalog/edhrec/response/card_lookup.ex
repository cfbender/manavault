defmodule Manavault.Catalog.EDHRec.Response.CardLookup do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, Deck, Printing}
  alias Manavault.Repo

  def local_card(identifier, name) when is_binary(identifier) and identifier != "" do
    local_card_by_oracle_id(identifier) ||
      local_card_by_printing_id(identifier) ||
      local_card_by_name(name)
  end

  def local_card(_identifier, name), do: local_card_by_name(name)

  def matching_deck_card(%Deck{} = deck, oracle_id, name) do
    deck.deck_cards
    |> Enum.reject(&(&1.zone == "maybeboard"))
    |> Enum.find(fn deck_card ->
      deck_card.oracle_id == oracle_id or
        normalize_name(deck_card.card.name) == normalize_name(name)
    end)
  end

  def local_card_oracle_id(%Card{oracle_id: oracle_id}), do: oracle_id
  def local_card_oracle_id(_card), do: nil

  def entry_name(%{"name" => name}) when is_binary(name), do: name
  def entry_name(%{name: name}) when is_binary(name), do: name
  def entry_name(_entry), do: ""

  def entry_oracle_id(%{"oracle_id" => oracle_id}) when is_binary(oracle_id), do: oracle_id
  def entry_oracle_id(%{oracle_id: oracle_id}) when is_binary(oracle_id), do: oracle_id
  def entry_oracle_id(_entry), do: nil

  def entry_string(entry, key) do
    case Map.get(entry, key) || Map.get(entry, String.to_atom(key)) do
      value when is_binary(value) -> value
      _value -> nil
    end
  end

  def entry_number(entry, key) do
    case Map.get(entry, key) || Map.get(entry, String.to_atom(key)) do
      value when is_integer(value) -> value
      value when is_float(value) -> value
      _value -> nil
    end
  end

  def card_slug(name) do
    name
    |> String.downcase()
    |> String.replace(~r/['’,]/u, "")
    |> String.replace(~r/[^a-z0-9]+/u, "-")
    |> String.trim("-")
  end

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

  defp normalize_name(value) do
    value
    |> to_string()
    |> String.downcase()
    |> String.replace(~r/[^[:alnum:]]+/u, " ")
    |> String.trim()
  end
end
