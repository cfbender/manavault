defmodule Manavault.Catalog.Location do
  use Ecto.Schema

  import Ecto.Changeset

  schema "locations" do
    field :name, :string
    field :kind, :string, default: "box"
    field :description, :string

    has_many :collection_items, Manavault.Catalog.CollectionItem

    timestamps(type: :utc_datetime)
  end

  @kinds ~w(box binder deck_box list folder other)

  def changeset(location, attrs) do
    location
    |> cast(attrs, [:name, :kind, :description])
    |> validate_required([:name, :kind])
    |> validate_inclusion(:kind, @kinds)
    |> unique_constraint(:name)
  end
end
