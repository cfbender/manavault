defmodule Manavault.Catalog.PrintingArtHash do
  use Ecto.Schema

  import Ecto.Changeset

  @primary_key {:scryfall_id, :string, []}
  @foreign_key_type :string
  schema "scryfall_printing_art_hashes" do
    field :hash, :string
    field :source_url, :string
    field :image_path, :string

    belongs_to :printing, Manavault.Catalog.Printing,
      references: :scryfall_id,
      foreign_key: :scryfall_id,
      define_field: false

    timestamps(type: :utc_datetime)
  end

  def changeset(art_hash, attrs) do
    art_hash
    |> cast(attrs, [:scryfall_id, :hash, :source_url, :image_path])
    |> validate_required([:scryfall_id, :hash])
    |> validate_format(:hash, ~r/\A[0-9a-f]{16}\z/)
    |> foreign_key_constraint(:scryfall_id)
  end
end
