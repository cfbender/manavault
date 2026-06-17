defmodule Manavault.Repo.Migrations.AddSourceLocationToDeckAllocations do
  use Ecto.Migration

  def change do
    alter table(:deck_allocations) do
      add :source_location_id, references(:locations, on_delete: :nilify_all)
    end

    create index(:deck_allocations, [:source_location_id])
  end
end
