defmodule Manavault.Repo.Migrations.CreateLocations do
  use Ecto.Migration

  def change do
    create table(:locations) do
      add :name, :string, null: false
      add :kind, :string, null: false, default: "box"
      add :description, :text

      timestamps(type: :utc_datetime)
    end

    create unique_index(:locations, :name)
  end
end
