defmodule Manavault.Repo.Migrations.CreateCollectionItems do
  use Ecto.Migration

  def change do
    create table(:collection_items) do
      add :scryfall_id,
          references(:scryfall_printings,
            column: :scryfall_id,
            type: :string,
            on_delete: :delete_all
          ),
          null: false

      add :quantity, :integer, null: false, default: 1
      add :condition, :string, null: false, default: "near_mint"
      add :language, :string, null: false, default: "en"
      add :finish, :string, null: false, default: "nonfoil"
      add :location, :string
      add :notes, :text

      timestamps(type: :utc_datetime)
    end

    create index(:collection_items, [:scryfall_id])
    create index(:collection_items, [:condition])
    create index(:collection_items, [:language])
    create index(:collection_items, [:finish])
  end
end
