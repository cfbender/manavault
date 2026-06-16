defmodule Manavault.Catalog.ScanItem do
  use Ecto.Schema

  import Ecto.Changeset

  schema "scan_items" do
    field :image_path, :string
    field :status, :string, default: "pending"
    field :quantity, :integer, default: 1
    field :condition, :string, default: "near_mint"
    field :language, :string, default: "en"
    field :finish, :string, default: "nonfoil"

    belongs_to :scan_session, Manavault.Catalog.ScanSession,
      foreign_key: :scan_session_id,
      type: :integer

    belongs_to :accepted_printing, Manavault.Catalog.Printing,
      references: :scryfall_id,
      foreign_key: :accepted_printing_id,
      type: :string

    belongs_to :location, Manavault.Catalog.Location,
      foreign_key: :location_id,
      type: :integer

    timestamps(type: :utc_datetime)
  end

  @statuses ~w(pending processing recognized needs_review accepted rejected failed)
  @conditions ~w(near_mint lightly_played moderately_played heavily_played damaged)
  @finishes ~w(nonfoil foil etched)

  def changeset(scan_item, attrs) do
    scan_item
    |> cast(attrs, [
      :scan_session_id,
      :image_path,
      :status,
      :accepted_printing_id,
      :quantity,
      :condition,
      :language,
      :finish,
      :location_id
    ])
    |> validate_required([:scan_session_id, :status, :quantity, :condition, :language, :finish])
    |> validate_inclusion(:status, @statuses)
    |> validate_number(:quantity, greater_than: 0)
    |> validate_inclusion(:condition, @conditions)
    |> validate_inclusion(:finish, @finishes)
    |> foreign_key_constraint(:scan_session_id)
    |> foreign_key_constraint(:accepted_printing_id)
    |> foreign_key_constraint(:location_id)
  end
end
