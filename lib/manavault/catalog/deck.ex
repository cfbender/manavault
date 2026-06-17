defmodule Manavault.Catalog.Deck do
  use Ecto.Schema

  import Ecto.Changeset

  @formats ~w(commander standard pioneer modern legacy vintage pauper limited casual)
  @statuses ~w(brewing active archived)

  schema "decks" do
    field :name, :string
    field :format, :string, default: "commander"
    field :status, :string, default: "brewing"

    has_many :deck_cards, Manavault.Catalog.DeckCard, on_replace: :delete

    timestamps(type: :utc_datetime)
  end

  def formats, do: @formats
  def statuses, do: @statuses

  def changeset(deck, attrs) do
    deck
    |> cast(attrs, [:name, :format, :status])
    |> validate_required([:name, :format, :status])
    |> validate_length(:name, min: 1, max: 120)
    |> validate_inclusion(:format, @formats)
    |> validate_inclusion(:status, @statuses)
  end
end
