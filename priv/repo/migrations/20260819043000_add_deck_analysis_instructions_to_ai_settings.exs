defmodule Manavault.Repo.Migrations.AddDeckAnalysisInstructionsToAiSettings do
  use Ecto.Migration

  def change do
    alter table(:ai_settings) do
      add :deck_analysis_instructions, :text
    end
  end
end
