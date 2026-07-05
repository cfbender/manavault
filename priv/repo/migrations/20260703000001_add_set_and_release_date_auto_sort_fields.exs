defmodule Manavault.Repo.Migrations.AddSetAndReleaseDateAutoSortFields do
  use Ecto.Migration

  def change do
    alter table(:collection_auto_sort_rules) do
      add :set_operator, :string, null: false, default: "in"
      add :set_codes, :text, null: false, default: "[]"
      add :release_date_operator, :string, null: false, default: "after"
      add :release_date, :date
    end
  end
end
