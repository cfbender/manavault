defmodule Manavault.Catalog.Tokens.BackOptions do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, Printing, TokenItem}
  alias Manavault.Catalog.Tokens.{KnownBacks, SearchPrintings}
  alias Manavault.Repo

  @same_set_limit 100

  @type t :: %{known: [Printing.t()], same_set: [Printing.t()]}

  @doc """
  Candidate back faces for a single-faced token printing: `:known` are backs
  the user has already recorded on owned copies of this token (either side),
  then tokens Wizards' galleries show printed on its back, in data order;
  `:same_set` are the set's other tokens (minus the known ones) for when the
  data has no pairing or the user has a different printing. Both empty for an
  unknown ID.
  """
  @spec run(String.t()) :: t()
  def run(scryfall_id) when is_binary(scryfall_id) do
    case Repo.one(from p in Printing, where: p.scryfall_id == ^scryfall_id) do
      nil -> %{known: [], same_set: []}
      printing -> options(printing)
    end
  end

  defp options(%Printing{} = printing) do
    known = Enum.uniq_by(learned_backs(printing) ++ known_backs(printing), & &1.scryfall_id)
    known_ids = MapSet.new(known, & &1.scryfall_id)

    same_set =
      [set_code: printing.set_code, exclude_scryfall_id: printing.scryfall_id]
      |> SearchPrintings.run(limit: @same_set_limit)
      |> Enum.reject(&MapSet.member?(known_ids, &1.scryfall_id))

    %{known: known, same_set: same_set}
  end

  # Backs the user has recorded on owned copies of this token. Owned items store
  # whichever side was scanned as the front, so both directions count: items
  # fronted by this printing contribute their back, and items whose back is this
  # printing contribute their front. Most-owned pairings come first.
  defp learned_backs(%Printing{scryfall_id: scryfall_id}) do
    from(item in TokenItem,
      where: not is_nil(item.back_scryfall_id),
      where: item.scryfall_id == ^scryfall_id or item.back_scryfall_id == ^scryfall_id,
      select: {item.scryfall_id, item.back_scryfall_id, item.quantity}
    )
    |> Repo.all()
    |> Enum.group_by(
      fn {front, back, _quantity} -> if front == scryfall_id, do: back, else: front end,
      fn {_front, _back, quantity} -> quantity end
    )
    |> Enum.reject(fn {other_id, _quantities} -> other_id == scryfall_id end)
    |> Enum.sort_by(fn {_other_id, quantities} -> -Enum.sum(quantities) end)
    |> Enum.map(fn {other_id, _quantities} -> other_id end)
    |> token_printings_in_order()
  end

  defp token_printings_in_order([]), do: []

  defp token_printings_in_order(ids) do
    order = ids |> Enum.with_index() |> Map.new()

    Printing
    |> where([printing], printing.scryfall_id in ^ids)
    |> join(:inner, [printing], card in assoc(printing, :card), as: :card)
    |> where(^Card.token())
    |> preload([_printing, card], card: card)
    |> Repo.all()
    |> Enum.sort_by(&Map.fetch!(order, &1.scryfall_id))
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
