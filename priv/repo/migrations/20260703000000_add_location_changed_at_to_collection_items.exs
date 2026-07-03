defmodule Manavault.Repo.Migrations.AddLocationChangedAtToCollectionItems do
  use Ecto.Migration

  def change do
    alter table(:collection_items) do
      add :location_changed_at, :utc_datetime
    end

    create index(:collection_items, :location_changed_at)
  end
end
