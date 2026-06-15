defmodule Manavault.Catalog.Card do
  use Ecto.Schema

  import Ecto.Changeset

  @primary_key {:oracle_id, :string, []}
  @foreign_key_type :string
  schema "scryfall_cards" do
    field :name, :string
    field :type_line, :string
    field :oracle_text, :string
    field :color_identity, :string, default: "[]"
    field :legalities, :string, default: "{}"

    has_many :printings, Manavault.Catalog.Printing, foreign_key: :oracle_id

    timestamps(type: :utc_datetime)
  end

  def changeset(card, attrs) do
    card
    |> cast(attrs, [:oracle_id, :name, :type_line, :oracle_text, :color_identity, :legalities])
    |> validate_required([:oracle_id, :name, :color_identity, :legalities])
  end
end
