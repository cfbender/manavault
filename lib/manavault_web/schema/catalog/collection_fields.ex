defmodule ManavaultWeb.Schema.Catalog.CollectionFields do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog
  alias Manavault.Catalog.{CollectionItem, DeckAllocation, Location, Price}
  alias Manavault.Repo

  def location_item_count(%Location{item_count: count}, _args, _resolution)
      when is_integer(count) do
    {:ok, count}
  end

  def location_item_count(%{item_count: count}, _args, _resolution) when is_integer(count) do
    {:ok, count}
  end

  def location_item_count(%Location{collection_items: items}, _args, _resolution)
      when is_list(items) do
    {:ok, Enum.reduce(items, 0, &((&1.quantity || 0) + &2))}
  end

  def location_item_count(%Location{} = location, _args, _resolution) do
    {:ok, Catalog.count_collection_items(location_id: to_string(location.id))}
  end

  def location_item_count(%{id: "unfiled"}, _args, _resolution) do
    {:ok, Catalog.count_collection_items(location_id: "unfiled")}
  end

  def location_total_price_cents(parent, _args, _resolution) do
    {:ok, parent |> location_value_summary_data() |> Map.fetch!(:total_price_cents)}
  end

  def location_total_price_text(parent, _args, _resolution) do
    {:ok, parent |> location_value_summary_data() |> Map.fetch!(:total_price_text)}
  end

  def location_purchase_price_cents(parent, _args, _resolution) do
    {:ok, parent |> location_value_summary_data() |> Map.fetch!(:purchase_price_cents)}
  end

  def location_purchase_price_text(parent, _args, _resolution) do
    {:ok, parent |> location_value_summary_data() |> Map.fetch!(:purchase_price_text)}
  end

  def location_value_gain_cents(parent, _args, _resolution) do
    {:ok, parent |> location_value_summary_data() |> Map.fetch!(:value_gain_cents)}
  end

  def location_value_gain_text(parent, _args, _resolution) do
    {:ok, parent |> location_value_summary_data() |> Map.fetch!(:value_gain_text)}
  end

  def location_value_gain_percent(parent, _args, _resolution) do
    {:ok, parent |> location_value_summary_data() |> Map.fetch!(:value_gain_percent)}
  end

  def location_value_gain_percent_text(parent, _args, _resolution) do
    {:ok, parent |> location_value_summary_data() |> Map.fetch!(:value_gain_percent_text)}
  end

  def location_value_summary(parent, _args, _resolution) do
    {:ok, location_value_summary_data(parent)}
  end

  def location_collection_items(%Location{id: id}, args, _resolution) do
    filters = [location_id: to_string(id)]
    opts = [limit: Map.get(args, :limit, 100), offset: Map.get(args, :offset, 0)]
    {:ok, Catalog.list_collection_items(filters, opts)}
  end

  def location_collection_items(%{id: "unfiled"}, args, _resolution) do
    filters = [location_id: "unfiled"]
    opts = [limit: Map.get(args, :limit, 100), offset: Map.get(args, :offset, 0)]
    {:ok, Catalog.list_collection_items(filters, opts)}
  end

  def collection_item_location(
        %CollectionItem{location_assoc: %Location{} = location},
        _args,
        _resolution
      ),
      do: {:ok, location}

  def collection_item_location(%CollectionItem{location_assoc: nil}, _args, _resolution),
    do: {:ok, nil}

  def collection_item_location(%CollectionItem{} = item, _args, _resolution) do
    {:ok, item |> Repo.preload(:location_assoc) |> Map.get(:location_assoc)}
  end

  def collection_item_current_price_cents(%CollectionItem{} = item, _args, _resolution) do
    {:ok, Price.collection_item_price_cents(item)}
  end

  def collection_item_purchase_price_cents(%CollectionItem{} = item, _args, _resolution) do
    {:ok, Price.collection_item_purchase_price_cents(item)}
  end

  def collection_item_price_text(%CollectionItem{} = item, _args, _resolution) do
    {:ok, Price.text_for_collection_item(item)}
  end

  def collection_item_purchase_price_text(%CollectionItem{} = item, _args, _resolution) do
    {:ok, Price.purchase_text_for_collection_item(item)}
  end

  def collection_item_value_gain_cents(%CollectionItem{} = item, _args, _resolution) do
    {:ok, Price.collection_item_value_gain_cents(item)}
  end

  def collection_item_value_gain_text(%CollectionItem{} = item, _args, _resolution) do
    {:ok, item |> Price.collection_item_value_gain_cents() |> Price.format_signed_cents()}
  end

  def collection_item_value_gain_percent(%CollectionItem{} = item, _args, _resolution) do
    purchase = Price.collection_item_purchase_price_cents(item)
    gain = Price.collection_item_value_gain_cents(item)
    {:ok, value_gain_percent(gain, purchase)}
  end

  def collection_item_value_gain_percent_text(%CollectionItem{} = item, _args, _resolution) do
    purchase = Price.collection_item_purchase_price_cents(item)
    gain = Price.collection_item_value_gain_cents(item)
    {:ok, gain |> value_gain_percent(purchase) |> Price.format_percent()}
  end

  def collection_item_allocated_quantity(
        %CollectionItem{deck_allocations: allocations},
        _args,
        _resolution
      )
      when is_list(allocations) do
    {:ok, Enum.reduce(allocations, 0, &(&1.quantity + &2))}
  end

  def collection_item_allocated_quantity(%CollectionItem{id: id}, _args, _resolution) do
    allocated =
      DeckAllocation
      |> where([allocation], allocation.collection_item_id == ^id)
      |> Repo.aggregate(:sum, :quantity)

    {:ok, allocated || 0}
  end

  def collection_value_summary_data(%{total_price_cents: total, purchase_price_cents: purchase}) do
    value_summary(total, purchase)
  end

  def collection_value_summary_data(items) do
    total = Price.collection_items_total_cents(items)
    purchase = Price.collection_items_purchase_total_cents(items)

    value_summary(total, purchase)
  end

  def location_value_summary_data(%{total_price_cents: total, purchase_price_cents: purchase})
      when is_integer(total) and is_integer(purchase) do
    value_summary(total, purchase)
  end

  def location_value_summary_data(parent) do
    parent
    |> location_items()
    |> collection_value_summary_data()
  end

  defp location_items(%Location{collection_items: items}) when is_list(items), do: items

  defp location_items(%Location{id: id}) do
    Catalog.list_collection_items([location_id: to_string(id)], limit: 100_000)
  end

  defp location_items(%{id: "unfiled"}) do
    Catalog.list_collection_items([location_id: "unfiled"], limit: 100_000)
  end

  defp value_summary(total, purchase) do
    gain = total - purchase
    percent = value_gain_percent(gain, purchase)

    %{
      total_price_cents: total,
      total_price_text: Price.format_cents(total),
      purchase_price_cents: purchase,
      purchase_price_text: Price.format_cents(purchase),
      value_gain_cents: gain,
      value_gain_text: Price.format_signed_cents(gain),
      value_gain_percent: percent,
      value_gain_percent_text: Price.format_percent(percent)
    }
  end

  defp value_gain_percent(gain, purchase)
       when is_integer(gain) and is_integer(purchase) and purchase > 0 do
    gain * 100 / purchase
  end

  defp value_gain_percent(_gain, _purchase), do: nil
end
