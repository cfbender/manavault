defmodule ManavaultWeb.Schema.Catalog.CollectionFields do
  @moduledoc false

  import Absinthe.Resolution.Helpers, only: [on_load: 2]

  alias Manavault.Catalog
  alias Manavault.Catalog.{CollectionItem, Location, Price, Printing}
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

  def location_item_count(%Location{} = location, _args, resolution) do
    resolve_location_summary_field(location, :item_count, resolution)
  end

  def location_item_count(%{id: "unfiled"}, _args, _resolution) do
    {:ok, Catalog.count_collection_items(location_id: "unfiled")}
  end

  def location_cover_printing(
        %Location{cover_printing: %Printing{} = printing},
        _args,
        _resolution
      ) do
    {:ok, printing}
  end

  def location_cover_printing(%Location{} = location, _args, %{context: %{loader: loader}}) do
    loader
    |> Dataloader.load(Catalog, :cover_printing, location)
    |> on_load(fn loader ->
      {:ok, Dataloader.get(loader, Catalog, :cover_printing, location)}
    end)
  end

  def location_cover_printing(%Location{} = location, _args, _resolution) do
    location = Repo.preload(location, cover_printing: :card)
    {:ok, location.cover_printing}
  end

  def location_cover_printing(%{cover_printing: printing}, _args, _resolution),
    do: {:ok, printing}

  def location_cover_printing(_parent, _args, _resolution), do: {:ok, nil}

  def location_total_price_cents(parent, _args, resolution) do
    resolve_location_summary_field(parent, :total_price_cents, resolution)
  end

  def location_total_price_text(parent, _args, resolution) do
    resolve_location_summary_field(parent, :total_price_text, resolution)
  end

  def location_purchase_price_cents(parent, _args, resolution) do
    resolve_location_summary_field(parent, :purchase_price_cents, resolution)
  end

  def location_purchase_price_text(parent, _args, resolution) do
    resolve_location_summary_field(parent, :purchase_price_text, resolution)
  end

  def location_value_gain_cents(parent, _args, resolution) do
    resolve_location_summary_field(parent, :value_gain_cents, resolution)
  end

  def location_value_gain_text(parent, _args, resolution) do
    resolve_location_summary_field(parent, :value_gain_text, resolution)
  end

  def location_value_gain_percent(parent, _args, resolution) do
    resolve_location_summary_field(parent, :value_gain_percent, resolution)
  end

  def location_value_gain_percent_text(parent, _args, resolution) do
    resolve_location_summary_field(parent, :value_gain_percent_text, resolution)
  end

  def location_value_summary(parent, _args, resolution) do
    resolve_location_summary_field(parent, :summary, resolution)
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
    {:ok, allocated_quantity(allocations)}
  end

  def collection_item_allocated_quantity(
        %CollectionItem{} = item,
        _args,
        %{context: %{loader: loader}}
      ) do
    loader
    |> Dataloader.load(Catalog, :deck_allocations, item)
    |> on_load(fn loader ->
      allocations = Dataloader.get(loader, Catalog, :deck_allocations, item)
      {:ok, allocated_quantity(allocations)}
    end)
  end

  def collection_item_allocated_quantity(%CollectionItem{} = item, _args, _resolution) do
    allocations = item |> Repo.preload(:deck_allocations) |> Map.fetch!(:deck_allocations)
    {:ok, allocated_quantity(allocations)}
  end

  def collection_value_summary_data(%{total_price_cents: total, purchase_price_cents: purchase}) do
    value_summary(total, purchase)
  end

  def collection_value_summary_data(items) do
    total = Price.collection_items_total_cents(items)
    purchase = Price.collection_items_purchase_total_cents(items)

    value_summary(total, purchase)
  end

  def location_value_summary_data(
        %{total_price_cents: total, purchase_price_cents: purchase} = summary
      )
      when is_integer(total) and is_integer(purchase) do
    total
    |> value_summary(purchase)
    |> put_item_count(summary)
  end

  def location_value_summary_data(parent) do
    parent
    |> location_items()
    |> collection_value_summary_data()
  end

  defp resolve_location_summary_field(parent, key, resolution) do
    case immediate_location_summary(parent) do
      {:ok, summary} ->
        {:ok, location_summary_value(summary, key)}

      :load ->
        load_location_summary(parent, key, resolution)
    end
  end

  defp immediate_location_summary(
         %{total_price_cents: total, purchase_price_cents: purchase} = summary
       )
       when is_integer(total) and is_integer(purchase) do
    {:ok, location_value_summary_data(summary)}
  end

  defp immediate_location_summary(%Location{collection_items: items}) when is_list(items) do
    {:ok, collection_value_summary_data(items)}
  end

  defp immediate_location_summary(%Location{}), do: :load

  defp immediate_location_summary(%{id: "unfiled"} = parent) do
    {:ok, location_value_summary_data(parent)}
  end

  defp immediate_location_summary(parent), do: {:ok, location_value_summary_data(parent)}

  defp load_location_summary(%Location{} = location, key, %{context: %{loader: loader}}) do
    loader
    |> Dataloader.load(Catalog, {:one, Location}, value_summary: location)
    |> on_load(fn loader ->
      summary =
        loader
        |> Dataloader.get(Catalog, {:one, Location}, value_summary: location)
        |> location_value_summary_data()

      {:ok, location_summary_value(summary, key)}
    end)
  end

  defp load_location_summary(%Location{id: id}, key, _resolution) do
    summary =
      [location_id: to_string(id)]
      |> Catalog.collection_value_summary()
      |> location_value_summary_data()

    {:ok, location_summary_value(summary, key)}
  end

  defp location_summary_value(summary, :summary), do: summary
  defp location_summary_value(summary, key), do: Map.fetch!(summary, key)

  defp put_item_count(summary, %{item_count: count}) when is_integer(count) do
    Map.put(summary, :item_count, count)
  end

  defp put_item_count(summary, _source), do: summary

  defp location_items(%Location{collection_items: items}) when is_list(items), do: items

  defp location_items(%Location{id: id}) do
    Catalog.list_collection_items([location_id: to_string(id)], limit: 100_000)
  end

  defp location_items(%{id: "unfiled"}) do
    Catalog.list_collection_items([location_id: "unfiled"], limit: 100_000)
  end

  defp allocated_quantity(allocations) when is_list(allocations) do
    Enum.reduce(allocations, 0, &(&1.quantity + &2))
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
