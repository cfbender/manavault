defmodule Manavault.Catalog.Printing do
  use Ecto.Schema

  import Ecto.Changeset

  @primary_key {:scryfall_id, :string, []}
  @foreign_key_type :string
  schema "scryfall_printings" do
    field :set_code, :string
    field :set_name, :string
    field :collector_number, :string
    field :lang, :string
    field :finishes, :string, default: "[]"
    field :image_uris, :string, default: "{}"
    field :prices, :string, default: "{}"
    field :released_at, :date

    belongs_to :card, Manavault.Catalog.Card,
      references: :oracle_id,
      foreign_key: :oracle_id,
      define_field: true

    has_many :collection_items, Manavault.Catalog.CollectionItem,
      foreign_key: :scryfall_id,
      references: :scryfall_id

    timestamps(type: :utc_datetime)
  end

  def changeset(printing, attrs) do
    printing
    |> cast(attrs, [
      :scryfall_id,
      :oracle_id,
      :set_code,
      :set_name,
      :collector_number,
      :lang,
      :finishes,
      :image_uris,
      :prices,
      :released_at
    ])
    |> validate_required([:scryfall_id, :oracle_id, :set_code, :collector_number, :lang])
  end
end
