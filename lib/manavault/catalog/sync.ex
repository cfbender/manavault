defmodule Manavault.Catalog.Sync do
  use Ecto.Schema

  import Ecto.Changeset

  schema "scryfall_syncs" do
    field :status, :string
    field :bulk_type, :string
    field :bulk_uri, :string
    field :started_at, :utc_datetime
    field :completed_at, :utc_datetime
    field :cards_count, :integer, default: 0
    field :printings_count, :integer, default: 0
    field :error, :string

    timestamps(type: :utc_datetime)
  end

  def changeset(sync, attrs) do
    sync
    |> cast(attrs, [
      :status,
      :bulk_type,
      :bulk_uri,
      :started_at,
      :completed_at,
      :cards_count,
      :printings_count,
      :error
    ])
    |> validate_required([:status, :bulk_type, :started_at])
  end
end
