defmodule Manavault.Repo.Migrations.CreateAppearanceSettings do
  use Ecto.Migration

  def change do
    create table(:appearance_settings, primary_key: false) do
      add :id, :integer, primary_key: true
      add :palette, :string, null: false, default: "claret"
      add :theme_style, :string, null: false, default: "glass"

      timestamps(type: :utc_datetime)
    end
  end
end
