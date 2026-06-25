defmodule Manavault.Catalog.CardCollection.ItemQueries.Base do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.CollectionItem
  alias Manavault.Catalog.DeckAllocation
  alias Manavault.Catalog.CardCollection.SearchFilter

  def base_query(filters) do
    query = filters |> Keyword.get(:q, "") |> normalize_filter()
    condition = filters |> Keyword.get(:condition, "") |> normalize_filter()
    language = filters |> Keyword.get(:language, "") |> normalize_filter()
    finish = filters |> Keyword.get(:finish, "") |> normalize_filter()
    location_id = filters |> Keyword.get(:location_id, "") |> normalize_filter()
    card_id = filters |> Keyword.get(:card_id, "") |> normalize_filter()
    include_list_locations? = Keyword.get(filters, :include_list_locations, false)

    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:inner, [_item, printing], card in assoc(printing, :card))
    |> join(:left, [item, _printing, _card], location in assoc(item, :location_assoc))
    |> SearchFilter.apply(query)
    |> maybe_filter_card_id(card_id)
    |> maybe_filter_condition(condition)
    |> maybe_filter_language(language)
    |> maybe_filter_finish(finish)
    |> maybe_filter_location(location_id)
    |> maybe_exclude_deck_allocations(location_id)
    |> maybe_exclude_list_locations(location_id, include_list_locations?)
  end

  defp maybe_filter_card_id(query, ""), do: query

  defp maybe_filter_card_id(query, card_id) do
    where(query, [_item, _printing, card, _location], card.oracle_id == ^card_id)
  end

  defp maybe_filter_condition(query, ""), do: query

  defp maybe_filter_condition(query, condition) do
    where(query, [item, _printing, _card, _location], item.condition == ^condition)
  end

  defp maybe_filter_language(query, ""), do: query

  defp maybe_filter_language(query, language) do
    where(query, [item, _printing, _card, _location], item.language == ^language)
  end

  defp maybe_filter_finish(query, ""), do: query

  defp maybe_filter_finish(query, finish) do
    where(query, [item, _printing, _card, _location], item.finish == ^finish)
  end

  defp maybe_filter_location(query, ""), do: query

  defp maybe_filter_location(query, "unfiled") do
    where(query, [item, _printing, _card, _location], is_nil(item.location_id))
  end

  defp maybe_filter_location(query, location_id) do
    case Integer.parse(location_id) do
      {id, ""} -> where(query, [item, _printing, _card, _location], item.location_id == ^id)
      _invalid -> where(query, false)
    end
  end

  defp maybe_exclude_deck_allocations(query, ""), do: query

  defp maybe_exclude_deck_allocations(query, _location_id) do
    allocated_item_ids = from allocation in DeckAllocation, select: allocation.collection_item_id

    where(
      query,
      [item, _printing, _card, _location],
      item.id not in subquery(allocated_item_ids)
    )
  end

  defp maybe_exclude_list_locations(query, location_id, _include_list_locations?)
       when location_id != "",
       do: query

  defp maybe_exclude_list_locations(query, _location_id, true), do: query

  defp maybe_exclude_list_locations(query, _location_id, _include_list_locations?) do
    where(
      query,
      [_item, _printing, _card, location],
      is_nil(location.id) or location.kind != "list"
    )
  end

  defp normalize_filter(value) when is_binary(value), do: String.trim(value)
  defp normalize_filter(_value), do: ""
end
