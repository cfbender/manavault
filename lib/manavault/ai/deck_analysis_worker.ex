defmodule Manavault.AI.DeckAnalysisWorker do
  @moduledoc false

  use Oban.Worker,
    queue: :ai,
    max_attempts: 3,
    unique: [period: :infinity, fields: [:worker, :args], states: :incomplete]

  alias Manavault.AI
  alias Manavault.Catalog.Deck
  alias Manavault.Repo

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"deck_id" => id}}) do
    case Repo.get(Deck, id) do
      nil ->
        :ok

      deck ->
        case AI.analyze_deck(deck) do
          {:ok, _deck} -> :ok
          {:error, %Ecto.Changeset{}} -> {:error, "Could not save the AI deck analysis."}
          {:error, reason} -> {:error, reason}
        end
    end
  end

  @impl Oban.Worker
  def backoff(%Oban.Job{attempt: attempt}), do: attempt * 15

  @impl Oban.Worker
  def timeout(_job), do: :timer.minutes(10)
end
