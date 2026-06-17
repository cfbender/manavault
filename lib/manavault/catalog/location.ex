defmodule Manavault.Catalog.Location do
  use Ecto.Schema

  import Ecto.Changeset

  schema "locations" do
    field :name, :string
    field :kind, :string, default: "box"
    field :description, :string

    belongs_to :cover_printing, Manavault.Catalog.Printing,
      references: :scryfall_id,
      foreign_key: :cover_scryfall_id,
      type: :string

    has_many :collection_items, Manavault.Catalog.CollectionItem

    timestamps(type: :utc_datetime)
  end

  @kinds ~w(box binder deck_box list folder other)

  def changeset(location, attrs) do
    location
    |> cast(attrs, [:name, :kind, :description, :cover_scryfall_id])
    |> validate_required([:name, :kind])
    |> validate_inclusion(:kind, @kinds)
    |> unique_constraint(:name)
    |> foreign_key_constraint(:cover_scryfall_id)
  end
end
