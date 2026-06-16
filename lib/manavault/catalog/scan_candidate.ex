defmodule Manavault.Catalog.ScanCandidate do
  use Ecto.Schema

  import Ecto.Changeset

  schema "scan_candidates" do
    field :source, :string
    field :confidence, :float
    field :rank, :integer, default: 1
    field :evidence, :string, default: "{}"

    belongs_to :scan_item, Manavault.Catalog.ScanItem

    belongs_to :printing, Manavault.Catalog.Printing,
      references: :scryfall_id,
      foreign_key: :printing_id,
      type: :string

    belongs_to :card, Manavault.Catalog.Card,
      references: :oracle_id,
      foreign_key: :oracle_id,
      type: :string

    timestamps(type: :utc_datetime)
  end

  @sources ~w(ocr image_match exact_collector user_search)

  def changeset(scan_candidate, attrs) do
    scan_candidate
    |> cast(attrs, [
      :scan_item_id,
      :printing_id,
      :oracle_id,
      :source,
      :confidence,
      :rank,
      :evidence
    ])
    |> validate_required([:scan_item_id, :source, :rank, :evidence])
    |> validate_inclusion(:source, @sources)
    |> validate_number(:rank, greater_than: 0)
    |> validate_number(:confidence, greater_than_or_equal_to: 0.0, less_than_or_equal_to: 1.0)
    |> foreign_key_constraint(:scan_item_id)
    |> foreign_key_constraint(:printing_id)
    |> foreign_key_constraint(:oracle_id)
  end
end
