defmodule Manavault.Catalog.Decks.QuestionAnswers do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Deck, DeckQuestionAnswer}
  alias Manavault.Repo

  def list_deck_question_answers(%Deck{id: deck_id}) do
    DeckQuestionAnswer
    |> where([question_answer], question_answer.deck_id == ^deck_id)
    |> order_by([question_answer], desc: question_answer.inserted_at, desc: question_answer.id)
    |> Repo.all()
  end

  def get_deck_question_answer(id), do: Repo.get(DeckQuestionAnswer, id)

  def create_deck_question_answer(%Deck{} = deck, attrs) when is_map(attrs) do
    deck
    |> change_deck_question_answer(attrs)
    |> Repo.insert()
  end

  def change_deck_question_answer(%Deck{id: deck_id}, attrs) when is_map(attrs) do
    %DeckQuestionAnswer{}
    |> DeckQuestionAnswer.changeset(Map.put(attrs, :deck_id, deck_id))
  end

  def complete_deck_question_answer(%DeckQuestionAnswer{} = question_answer, attrs) do
    attrs = Map.merge(attrs, %{status: "completed", error: nil})

    question_answer
    |> DeckQuestionAnswer.changeset(attrs)
    |> Repo.update()
  end

  def fail_deck_question_answer(%DeckQuestionAnswer{} = question_answer, error) do
    question_answer
    |> DeckQuestionAnswer.changeset(%{status: "failed", error: error})
    |> Repo.update()
  end

  def delete_deck_question_answer(%DeckQuestionAnswer{} = question_answer) do
    Repo.delete(question_answer)
  end
end
