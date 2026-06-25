defmodule Manavault.Repo.Migrations.AddCollectionAutoSortRules do
  use Ecto.Migration

  def change do
    create table(:collection_auto_sort_rules) do
      add :name, :string, null: false
      add :enabled, :boolean, null: false, default: true
      add :priority, :integer, null: false
      add :target_location_id, references(:locations, on_delete: :delete_all), null: false
      add :color_mode, :string, null: false, default: "any"
      add :colors, :text, null: false, default: "[]"
      add :type_line_includes, :text, null: false, default: "[]"
      add :type_line_excludes, :text, null: false, default: "[]"
      add :rarities, :text, null: false, default: "[]"
      add :min_price_cents, :integer
      add :max_price_cents, :integer

      timestamps(type: :utc_datetime)
    end

    create index(:collection_auto_sort_rules, [:enabled, :priority])
    create index(:collection_auto_sort_rules, [:target_location_id])
  end
end
