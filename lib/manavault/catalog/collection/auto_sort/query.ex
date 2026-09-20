defmodule Manavault.Catalog.Collection.AutoSort.Query do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{AutoSortRule, CollectionItem, DeckAllocation, Location}
  alias Manavault.Repo

  @location_debounce_days 30

  def build(opts) do
    cond do
      Keyword.has_key?(opts, :item_ids) ->
        ids = opts |> Keyword.get(:item_ids) |> List.wrap()
        {:ok, opts |> base() |> where([item], item.id in ^ids)}

      Keyword.get(opts, :source_location_id) == "unfiled" ->
        {:ok, opts |> base() |> where([item], is_nil(item.location_id))}

      is_nil(Keyword.get(opts, :source_location_id)) ->
        {:ok, opts |> base() |> where([location: location], is_nil(location.id) or location.kind != "list")}

      true ->
        with {:ok, location_id} <- normalize_location_id(Keyword.get(opts, :source_location_id)) do
          {:ok, opts |> base() |> where([item], item.location_id == ^location_id)}
        else
          :error -> {:error, :location_not_found}
        end
    end
  end

  def batch(query, after_id, batch_size) do
    query
    |> where([item], item.id > ^after_id)
    |> limit(^batch_size)
    |> Repo.all()
  end

  def enabled_rules do
    AutoSortRule
    |> join(:inner, [rule], location in assoc(rule, :target_location))
    |> where([rule, location], rule.enabled == true and location.kind in ["box", "binder"])
    |> order_by([rule], asc: rule.priority, asc: rule.id)
    |> preload([rule, location], target_location: location)
    |> Repo.all()
  end

  def locations_by_id(location_ids) do
    Location
    |> where([location], location.id in ^location_ids and location.kind in ["box", "binder"])
    |> Repo.all()
    |> Map.new(&{&1.id, &1})
  end

  defp base(opts) do
    allocated_item_ids = from(allocation in DeckAllocation, select: allocation.collection_item_id)

    opts
    |> apply_location_debounce(CollectionItem)
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:inner, [_item, printing], card in assoc(printing, :card))
    |> join(:left, [item, _printing, _card], location in assoc(item, :location_assoc), as: :location)
    |> where([item], item.id not in subquery(allocated_item_ids))
    |> preload([_item, printing, card, location],
      printing: {printing, card: card},
      location_assoc: location
    )
    |> order_by([item], asc: item.id)
  end

  defp apply_location_debounce(opts, query) do
    if Keyword.get(opts, :ignore_location_debounce, false) == true do
      query
    else
      cutoff = DateTime.add(DateTime.utc_now(), -@location_debounce_days * 86_400, :second)
      where(query, [item], is_nil(item.location_changed_at) or item.location_changed_at < ^cutoff)
    end
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
