defmodule Manavault.Repo.Migrations.AddRecommendationsToDeckQuestionAnswers do
  use Ecto.Migration

  def change do
    alter table(:deck_question_answers) do
      add :recommendations, :map
    end
  end
end
