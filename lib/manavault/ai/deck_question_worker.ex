defmodule Manavault.AI.DeckQuestionWorker do
  @moduledoc false

  use Oban.Worker, queue: :ai, max_attempts: 3

  alias Manavault.AI

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"question_answer_id" => id}} = job) do
    case AI.answer_deck_question(id) do
      :ok ->
        :ok

      {:error, reason} when job.attempt >= job.max_attempts ->
        case AI.fail_deck_question(id, reason) do
          :ok -> {:error, reason}
          {:error, _failure} = error -> error
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  @impl Oban.Worker
  def backoff(%Oban.Job{attempt: attempt}), do: attempt * 15

  @impl Oban.Worker
  def timeout(_job), do: :timer.minutes(10)
end
