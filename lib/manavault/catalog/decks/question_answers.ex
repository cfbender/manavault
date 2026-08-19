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

  def create_deck_question_answer(%Deck{id: deck_id}, attrs) when is_map(attrs) do
    attrs = Map.put(attrs, :deck_id, deck_id)

    %DeckQuestionAnswer{}
    |> DeckQuestionAnswer.changeset(attrs)
    |> Repo.insert()
  end

  def delete_deck_question_answer(%DeckQuestionAnswer{} = question_answer) do
    Repo.delete(question_answer)
  end
end
