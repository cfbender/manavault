defmodule Manavault.Catalog.DeckQuestionAnswer do
  use Ecto.Schema

  import Ecto.Changeset

  schema "deck_question_answers" do
    field :question, :string
    field :answer, :string, default: ""
    field :recommendations, :map
    field :status, :string, default: "completed"
    field :error, :string
    field :model, :string

    belongs_to :deck, Manavault.Catalog.Deck

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(question_answer, attrs) do
    question_answer
    |> cast(attrs, [:question, :answer, :recommendations, :status, :error, :model, :deck_id])
    |> validate_required([:question, :status, :deck_id])
    |> validate_inclusion(:status, ~w(pending completed failed))
    |> validate_length(:question, max: 1_000)
    |> validate_length(:answer, max: 100_000)
    |> validate_length(:error, max: 2_000)
    |> validate_length(:model, max: 200)
    |> validate_answer_state()
    |> foreign_key_constraint(:deck_id)
  end

  defp validate_answer_state(changeset) do
    case get_field(changeset, :status) do
      "completed" -> validate_required(changeset, [:answer])
      "failed" -> validate_required(changeset, [:error])
      _status -> changeset
    end
  end
end
