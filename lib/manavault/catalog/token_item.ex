defmodule Manavault.Catalog.TokenItem do
  @moduledoc """
  Owned copies of a token printing. Tokens are browsed and counted against deck
  token needs but are never allocated to decks, filed in locations, or valued,
  so they live apart from `CollectionItem`.

  `back_scryfall_id` records the other printed side of a double-sided token
  (common in Commander precons, which Scryfall lists as two single-faced tokens).
  """

  use Ecto.Schema

  import Ecto.Changeset

  @finishes ~w(nonfoil foil etched)

  @foreign_key_type :string
  schema "token_items" do
    field :quantity, :integer, default: 1
    field :finish, :string, default: "nonfoil"

    belongs_to :printing, Manavault.Catalog.Printing,
      references: :scryfall_id,
      foreign_key: :scryfall_id,
      define_field: true

    belongs_to :back_printing, Manavault.Catalog.Printing,
      references: :scryfall_id,
      foreign_key: :back_scryfall_id,
      define_field: true

    timestamps(type: :utc_datetime)
  end

  def changeset(token_item, attrs) do
    token_item
    |> cast(attrs, [:scryfall_id, :back_scryfall_id, :quantity, :finish])
    |> validate_required([:scryfall_id, :quantity, :finish])
    |> validate_number(:quantity, greater_than: 0)
    |> validate_inclusion(:finish, @finishes)
    |> foreign_key_constraint(:scryfall_id)
    |> foreign_key_constraint(:back_scryfall_id)
  end
end
