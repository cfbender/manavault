defmodule Manavault.Repo.Migrations.AddModelToDeckQuestionAnswers do
  use Ecto.Migration

  def change do
    alter table(:deck_question_answers) do
      add :model, :text
    end
  end
end
