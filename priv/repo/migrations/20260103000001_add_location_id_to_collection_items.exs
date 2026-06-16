defmodule Manavault.Repo.Migrations.AddLocationIdToCollectionItems do
  use Ecto.Migration

  def change do
    alter table(:collection_items) do
      add :location_id, references(:locations, on_delete: :nilify_all)
    end

    create index(:collection_items, :location_id)
  end
end
