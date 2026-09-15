defmodule Manavault.Repo.Migrations.AddAiDeckAnalysis do
  use Ecto.Migration

  def change do
    create table(:ai_settings, primary_key: false) do
      add :id, :integer, primary_key: true
      add :provider, :text, null: false, default: "openrouter"
      add :api_key, :text
      add :model, :text

      timestamps(type: :utc_datetime)
    end

    alter table(:decks) do
      add :ai_analysis, :text
      add :ai_analysis_model, :text
      add :ai_analyzed_at, :utc_datetime
      add :commander_bracket, :integer
      add :commander_bracket_estimate, :integer
    end
  end
end
