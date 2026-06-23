defmodule Manavault.Catalog.Collection.Locations do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{CardCollection, CollectionItem, Location}
  alias Manavault.Repo

  def count do
    Repo.aggregate(Location, :count)
  end

  def list(_opts \\ []) do
    Location
    |> order_by(asc: :name)
    |> Repo.all()
    |> Repo.preload(cover_printing: :card)
  end

  def summaries do
    CardCollection.location_summaries()
  end

  def list_summaries(summaries \\ nil) do
    all_summaries = summaries || __MODULE__.summaries()

    list()
    |> Enum.map(fn location ->
      put_summary(location, Map.get(all_summaries, location.id))
    end)
  end

  def get_summary!(id) do
    location =
      Location
      |> Repo.get!(id)
      |> Repo.preload(cover_printing: :card)

    all_summaries = __MODULE__.summaries()
    put_summary(location, Map.get(all_summaries, location.id))
  end

  def unfiled_summary(summaries \\ nil) do
    all_summaries = summaries || __MODULE__.summaries()
    Map.get(all_summaries, nil, empty_summary())
  end

  def options do
    Location
    |> order_by(asc: :name)
    |> select([location], %{id: location.id, name: location.name})
    |> Repo.all()
  end

  def get!(id) do
    Location |> Repo.get!(id)
  end

  def get_with_items!(id) do
    Location
    |> Repo.get!(id)
    |> Repo.preload(
      cover_printing: :card,
      collection_items:
        from(item in CollectionItem,
          join: printing in assoc(item, :printing),
          join: card in assoc(printing, :card),
          preload: [printing: {printing, card: card}],
          order_by: [asc: card.name, asc: printing.set_code, asc: printing.collector_number]
        )
    )
  end

  def list_items_by_location(location_id, filters \\ [], opts \\ []) when is_list(filters) do
    CardCollection.list_items_by_location(location_id, filters, opts)
  end

  def change(location, attrs \\ %{}) do
    Location.changeset(location, attrs)
  end

  def create(attrs \\ %{}) do
    %Location{}
    |> Location.changeset(attrs)
    |> Repo.insert()
  end

  def update(%Location{} = location, attrs) do
    location
    |> Location.changeset(attrs)
    |> Repo.update()
  end

  def delete(%Location{} = location) do
    Repo.delete(location)
  end

  defp put_summary(%Location{} = location, nil), do: put_summary(location, empty_summary())

  defp put_summary(%Location{} = location, summary) when is_map(summary) do
    %{
      location
      | item_count: summary.item_count,
        total_price_cents: summary.total_price_cents,
        purchase_price_cents: summary.purchase_price_cents
    }
  end

  defp empty_summary do
    %{item_count: 0, total_price_cents: 0, purchase_price_cents: 0}
  end
end
