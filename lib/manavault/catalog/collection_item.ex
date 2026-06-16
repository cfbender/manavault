defmodule Manavault.Catalog.CollectionItem do
  use Ecto.Schema

  import Ecto.Changeset

  @foreign_key_type :string
  schema "collection_items" do
    field :quantity, :integer, default: 1
    field :condition, :string, default: "near_mint"
    field :language, :string, default: "en"
    field :finish, :string, default: "nonfoil"
    field :location, :string
    field :notes, :string

    belongs_to :printing, Manavault.Catalog.Printing,
      references: :scryfall_id,
      foreign_key: :scryfall_id,
      define_field: true

    belongs_to :location_assoc, Manavault.Catalog.Location,
      foreign_key: :location_id,
      define_field: true,
      on_replace: :nilify,
      references: :id,
      type: :integer

    timestamps(type: :utc_datetime)
  end

  @conditions ~w(near_mint lightly_played moderately_played heavily_played damaged)
  @finishes ~w(nonfoil foil etched)

  def create_changeset(collection_item, attrs) do
    collection_item
    |> cast(attrs, [:scryfall_id, :quantity, :condition, :language, :finish, :location_id, :notes])
    |> validate_common_fields()
    |> validate_required([:scryfall_id])
    |> foreign_key_constraint(:scryfall_id)
    |> foreign_key_constraint(:location_id)
  end

  def update_changeset(collection_item, attrs) do
    collection_item
    |> cast(attrs, [:quantity, :condition, :language, :finish, :location_id, :notes])
    |> validate_common_fields()
    |> foreign_key_constraint(:location_id)
  end

  def switch_printing_changeset(collection_item, attrs) do
    collection_item
    |> cast(attrs, [:scryfall_id, :language, :finish])
    |> validate_required([:scryfall_id, :language, :finish])
    |> validate_inclusion(:finish, @finishes)
    |> foreign_key_constraint(:scryfall_id)
  end

  defp validate_common_fields(changeset) do
    changeset
    |> validate_required([:quantity, :condition, :language, :finish])
    |> validate_number(:quantity, greater_than: 0)
    |> validate_inclusion(:condition, @conditions)
    |> validate_inclusion(:finish, @finishes)
  end
end
