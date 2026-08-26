defmodule Manavault.Catalog.Decks.DeckPicker do
  @moduledoc false

  import Ecto.Changeset, only: [change: 2]
  import Ecto.Query

  alias Manavault.Catalog.Deck
  alias Manavault.Repo

  @unplayed_recency_hours 24 * 30

  def random_deck(opts \\ []) do
    decks = list_playable_decks()
    candidates = maybe_exclude_deck(decks, Keyword.get(opts, :exclude_id))
    now = Keyword.get_lazy(opts, :now, &DateTime.utc_now/0)
    random = Keyword.get(opts, :random, &:rand.uniform/0)

    pick_weighted(candidates, now, random.())
  end

  def record_outcome(%Deck{status: "archived"}, _outcome), do: {:error, :archived_deck}

  def record_outcome(%Deck{} = deck, :played) do
    deck
    |> change(%{
      play_count: deck.play_count + 1,
      last_played_at: DateTime.utc_now() |> DateTime.truncate(:second)
    })
    |> Repo.update()
  end

  def record_outcome(%Deck{} = deck, :skipped) do
    deck
    |> change(%{skip_count: deck.skip_count + 1})
    |> Repo.update()
  end

  def record_outcome(%Deck{}, _outcome), do: {:error, :invalid_outcome}

  @doc false
  def selection_weights(decks, now) when is_list(decks) do
    played_recencies =
      for %Deck{last_played_at: %DateTime{} = last_played_at} <- decks do
        recency_hours(last_played_at, now)
      end

    unplayed_recency =
      played_recencies
      |> Enum.max(fn -> 0 end)
      |> Kernel.+(@unplayed_recency_hours)
      |> max(@unplayed_recency_hours)

    Enum.map(decks, fn deck ->
      recency =
        case deck.last_played_at do
          %DateTime{} = last_played_at -> recency_hours(last_played_at, now)
          nil -> unplayed_recency
        end

      weight = recency * (deck.skip_count + 1) / (deck.play_count + 1)
      {deck, weight}
    end)
  end

  defp list_playable_decks do
    Deck
    |> where([deck], deck.status != "archived")
    |> order_by([deck], asc: deck.name, asc: deck.id)
    |> Repo.all()
  end

  defp maybe_exclude_deck(decks, exclude_id) when length(decks) > 1 do
    Enum.reject(decks, &(&1.id == exclude_id))
  end

  defp maybe_exclude_deck(decks, _exclude_id), do: decks

  defp pick_weighted([], _now, _random), do: nil

  defp pick_weighted(decks, now, random) do
    weighted_decks = selection_weights(decks, now)
    total_weight = Enum.sum_by(weighted_decks, &elem(&1, 1))
    threshold = min(max(random, 0.0), 1.0) * total_weight

    weighted_decks
    |> Enum.reduce_while(0.0, fn {deck, weight}, cumulative_weight ->
      next_weight = cumulative_weight + weight

      if threshold <= next_weight do
        {:halt, deck}
      else
        {:cont, next_weight}
      end
    end)
    |> case do
      %Deck{} = deck -> deck
      _cumulative_weight -> weighted_decks |> List.last() |> elem(0)
    end
  end

  defp recency_hours(last_played_at, now) do
    now
    |> DateTime.diff(last_played_at, :hour)
    |> Kernel.+(1)
    |> max(1)
  end
end
