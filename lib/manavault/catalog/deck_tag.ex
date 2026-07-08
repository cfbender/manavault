defmodule Manavault.Catalog.DeckTag do
  use Ecto.Schema

  import Ecto.Changeset

  schema "deck_tags" do
    field :name, :string
    field :color, :string
    field :target_count, :integer
    field :position, :integer, default: 0
    field :card_count, :integer, virtual: true

    belongs_to :deck, Manavault.Catalog.Deck
    has_many :deck_card_tags, Manavault.Catalog.DeckCardTag

    timestamps(type: :utc_datetime)
  end

  def changeset(deck_tag, attrs) do
    deck_tag
    |> cast(attrs, [:name, :color, :target_count, :position, :deck_id])
    |> validate_required([:name, :color, :deck_id])
    |> validate_length(:name, min: 1, max: 60)
    |> validate_format(:color, ~r/^#[0-9a-fA-F]{6}$/)
    |> validate_number(:target_count, greater_than: 0)
    |> unique_constraint([:deck_id, :name])
  end
end
