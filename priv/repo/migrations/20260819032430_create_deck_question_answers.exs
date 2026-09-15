defmodule Manavault.Repo.Migrations.CreateDeckQuestionAnswers do
  use Ecto.Migration

  def change do
    create table(:deck_question_answers) do
      add :deck_id, references(:decks, on_delete: :delete_all), null: false
      add :question, :text, null: false
      add :answer, :text, null: false

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:deck_question_answers, [:deck_id, :inserted_at])
  end
end
