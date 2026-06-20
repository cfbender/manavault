defmodule Manavault.Catalog.DeckCard do
  use Ecto.Schema

  import Ecto.Changeset

  @zones ~w(mainboard sideboard commander maybeboard)

  schema "deck_cards" do
    field :quantity, :integer, default: 1
    field :proxy_quantity, :integer, default: 0
    field :zone, :string, default: "mainboard"
    field :finish, :string, default: "nonfoil"

    belongs_to :deck, Manavault.Catalog.Deck

    belongs_to :card, Manavault.Catalog.Card,
      references: :oracle_id,
      foreign_key: :oracle_id,
      type: :string

    belongs_to :preferred_printing, Manavault.Catalog.Printing,
      references: :scryfall_id,
      foreign_key: :preferred_printing_id,
      type: :string

    has_many :deck_allocations, Manavault.Catalog.DeckAllocation, on_replace: :delete
    has_many :collection_items, through: [:deck_allocations, :collection_item]

    timestamps(type: :utc_datetime)
  end

  def zones, do: @zones

  def changeset(deck_card, attrs) do
    deck_card
    |> cast(attrs, [
      :deck_id,
      :oracle_id,
      :preferred_printing_id,
      :quantity,
      :proxy_quantity,
      :zone,
      :finish
    ])
    |> validate_required([:deck_id, :oracle_id, :quantity, :proxy_quantity, :zone, :finish])
    |> validate_number(:quantity, greater_than: 0, less_than: 10_000)
    |> validate_number(:proxy_quantity, greater_than_or_equal_to: 0, less_than: 10_000)
    |> validate_inclusion(:zone, @zones)
    |> validate_inclusion(:finish, ~w(nonfoil foil etched))
    |> foreign_key_constraint(:deck_id)
    |> foreign_key_constraint(:oracle_id)
    |> foreign_key_constraint(:preferred_printing_id)
    |> unique_constraint([:deck_id, :oracle_id, :zone])
  end
end
