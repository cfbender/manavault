defmodule Manavault.Catalog.DeckCardTag do
  use Ecto.Schema

  import Ecto.Changeset

  schema "deck_card_tags" do
    field :deck_id, :id

    belongs_to :deck_card, Manavault.Catalog.DeckCard
    belongs_to :deck_tag, Manavault.Catalog.DeckTag

    timestamps(type: :utc_datetime)
  end

  def changeset(deck_card_tag, attrs) do
    deck_card_tag
    |> cast(attrs, [:deck_card_id, :deck_tag_id, :deck_id])
    |> validate_required([:deck_card_id, :deck_tag_id, :deck_id])
    |> unique_constraint([:deck_card_id, :deck_tag_id])
  end
end
