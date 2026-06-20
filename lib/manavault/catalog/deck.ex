defmodule Manavault.Catalog.Deck do
  use Ecto.Schema

  import Ecto.Changeset

  @formats ~w(commander standard pioneer modern legacy vintage pauper limited casual)
  @statuses ~w(brewing active archived)

  schema "decks" do
    field :name, :string
    field :format, :string, default: "commander"
    field :status, :string, default: "brewing"
    field :share_token, :string

    has_many :deck_cards, Manavault.Catalog.DeckCard, on_replace: :delete
    has_many :deck_allocations, through: [:deck_cards, :deck_allocations]

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

  def share_changeset(deck, share_token) do
    deck
    |> change(share_token: share_token)
    |> validate_required([:share_token])
    |> unique_constraint(:share_token)
  end
end
