defmodule Manavault.Repo.Migrations.CreateDeckAnalysisRequests do
  use Ecto.Migration

  def change do
    create table(:deck_analysis_requests) do
      add :source_type, :text, null: false
      add :source, :text, null: false
      add :source_name, :text, null: false
      add :format, :text, null: false
      add :analysis, :text, null: false
      add :model, :text, null: false
      add :commander_bracket, :integer
      add :commander_bracket_estimate, :integer

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:deck_analysis_requests, [:inserted_at])
  end
end
