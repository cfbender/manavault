defmodule Manavault.Catalog.Tokens.BackOptions do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, Printing}
  alias Manavault.Catalog.Tokens.{KnownBacks, SearchPrintings}
  alias Manavault.Repo

  @same_set_limit 100

  @type t :: %{known: [Printing.t()], same_set: [Printing.t()]}

  @doc """
  Candidate back faces for a single-faced token printing: `:known` are tokens
  Wizards' galleries show printed on its back, in data order; `:same_set` are
  the set's other tokens (minus the known ones) for when the data has no
  pairing or the user has a different printing. Both empty for an unknown ID.
  """
  @spec run(String.t()) :: t()
  def run(scryfall_id) when is_binary(scryfall_id) do
    case Repo.one(from p in Printing, where: p.scryfall_id == ^scryfall_id) do
      nil -> %{known: [], same_set: []}
      printing -> options(printing)
    end
  end

  defp options(%Printing{} = printing) do
    known = known_backs(printing)
    known_ids = MapSet.new(known, & &1.scryfall_id)

    same_set =
      [set_code: printing.set_code, exclude_scryfall_id: printing.scryfall_id]
      |> SearchPrintings.run(limit: @same_set_limit)
      |> Enum.reject(&MapSet.member?(known_ids, &1.scryfall_id))

    %{known: known, same_set: same_set}
  end

  defp known_backs(%Printing{set_code: set_code, collector_number: collector_number}) do
    keys = KnownBacks.back_keys(set_code, collector_number)

    if keys == [] do
      []
    else
      order = keys |> Enum.with_index() |> Map.new()

      keys
      |> Enum.reduce(Printing, fn {set, number}, query ->
        or_where(
          query,
          [printing],
          printing.set_code == ^set and printing.collector_number == ^number
        )
      end)
      |> join(:inner, [printing], card in assoc(printing, :card), as: :card)
      |> where(^Card.token())
      |> preload([_printing, card], card: card)
      |> Repo.all()
      |> Enum.sort_by(&Map.fetch!(order, {&1.set_code, &1.collector_number}))
    end
  end
end
