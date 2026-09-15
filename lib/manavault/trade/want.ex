defmodule Manavault.Trade.Want do
  use Ecto.Schema

  import Ecto.Changeset

  schema "trade_wants" do
    field :quantity, :integer, default: 1

    belongs_to :card, Manavault.Catalog.Card,
      references: :oracle_id,
      foreign_key: :oracle_id,
      type: :string

    belongs_to :preferred_printing, Manavault.Catalog.Printing,
      references: :scryfall_id,
      foreign_key: :preferred_printing_id,
      type: :string

    timestamps(type: :utc_datetime)
  end

  def changeset(want, attrs) do
    want
    |> cast(attrs, [:oracle_id, :preferred_printing_id, :quantity])
    |> validate_required([:oracle_id, :quantity])
    |> validate_number(:quantity, greater_than_or_equal_to: 1)
    |> foreign_key_constraint(:oracle_id)
    |> foreign_key_constraint(:preferred_printing_id)
    |> unique_constraint(:oracle_id)
    |> unique_constraint([:oracle_id, :preferred_printing_id])
  end

  def quantity_changeset(want, attrs) do
    want
    |> cast(attrs, [:quantity])
    |> validate_required([:quantity])
    |> validate_number(:quantity, greater_than_or_equal_to: 1)
  end
end
