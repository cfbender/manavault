defmodule Manavault.Repo.Migrations.CreateDefaultDeckTags do
  use Ecto.Migration

  def up do
    create table(:default_deck_tags) do
      add :name, :string, null: false
      add :color, :string, null: false
      add :target_count, :integer
      add :position, :integer, null: false, default: 0

      timestamps(type: :utc_datetime)
    end

    create unique_index(:default_deck_tags, [:name])

    flush()

    now = DateTime.utc_now() |> DateTime.truncate(:second)

    repo().insert_all("default_deck_tags", [
      %{name: "Ramp", color: "#22C55E", position: 0, inserted_at: now, updated_at: now},
      %{name: "Draw", color: "#3B82F6", position: 1, inserted_at: now, updated_at: now},
      %{name: "Interact", color: "#EF4444", position: 2, inserted_at: now, updated_at: now},
      %{name: "Plan", color: "#A855F7", position: 3, inserted_at: now, updated_at: now}
    ])
  end

  def down do
    drop table(:default_deck_tags)
  end
end
