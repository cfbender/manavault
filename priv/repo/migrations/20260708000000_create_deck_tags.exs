defmodule Manavault.Repo.Migrations.CreateDeckTags do
  use Ecto.Migration

  def change do
    create table(:deck_tags) do
      add :deck_id, references(:decks, on_delete: :delete_all), null: false
      add :name, :string, null: false
      add :color, :string, null: false
      add :target_count, :integer
      add :position, :integer, null: false, default: 0

      timestamps(type: :utc_datetime)
    end

    create index(:deck_tags, [:deck_id])
    create unique_index(:deck_tags, [:deck_id, :name])
  end
end
