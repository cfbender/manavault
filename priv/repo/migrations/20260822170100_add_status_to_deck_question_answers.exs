defmodule Manavault.Repo.Migrations.AddStatusToDeckQuestionAnswers do
  use Ecto.Migration

  def change do
    alter table(:deck_question_answers) do
      add :status, :text, null: false, default: "completed"
      add :error, :text
    end
  end
end
