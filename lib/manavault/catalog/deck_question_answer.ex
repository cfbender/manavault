defmodule Manavault.Catalog.DeckQuestionAnswer do
  use Ecto.Schema

  import Ecto.Changeset

  schema "deck_question_answers" do
    field :question, :string
    field :answer, :string
    field :recommendations, :map

    belongs_to :deck, Manavault.Catalog.Deck

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(question_answer, attrs) do
    question_answer
    |> cast(attrs, [:question, :answer, :recommendations, :deck_id])
    |> validate_required([:question, :answer, :deck_id])
    |> validate_length(:question, max: 1_000)
    |> validate_length(:answer, max: 100_000)
    |> foreign_key_constraint(:deck_id)
  end
end
