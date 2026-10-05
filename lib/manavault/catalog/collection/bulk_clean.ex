defmodule Manavault.Catalog.Collection.BulkClean do
  @moduledoc """
  Suggests surplus copies of cheap cards to pull out of storage.

  A card qualifies when its loose copies (not allocated to a deck and not on a
  list) priced under `max_price_cents` add up to at least `min_copies`.
  Everything above `keep_copies` is suggested, pulling the cheapest printings
  first and then the largest stacks so fewer piles need to be visited. With
  `prefer_keep_foils`, nonfoil copies are pulled before any foil or etched copy.
  `kept` maps collection item ids to copies the user wants to keep from that
  stack; those copies are never pulled and the card's other stacks make up the
  difference. `swappable_copies` on each card says how many more copies could
  still be kept that way.

  `remove/1` deletes pulled copies from the collection once they are out.
  """

  import Ecto.Query

  import Manavault.Catalog.PriceFragments,
    only: [price_value_fragment: 2, price_cents_fragment: 2]

  alias Manavault.Catalog.{CollectionItem, DeckAllocation, Location, Util}
  alias Manavault.Repo

  @defaults [
    max_price_cents: 20,
    min_copies: 10,
    keep_copies: 4,
    prefer_keep_foils: true,
    kept: %{}
  ]

  def preview(opts \\ []) do
    opts = Keyword.merge(@defaults, Enum.reject(opts, fn {_key, value} -> is_nil(value) end))
    max_price_cents = max(Keyword.fetch!(opts, :max_price_cents), 0)
    min_copies = max(Keyword.fetch!(opts, :min_copies), 1)
    keep_copies = max(Keyword.fetch!(opts, :keep_copies), 0)
    prefer_keep_foils = Keyword.fetch!(opts, :prefer_keep_foils) == true
    kept = Keyword.fetch!(opts, :kept)

    cards =
      max_price_cents
      |> candidate_items(min_copies)
      |> Repo.all()
      |> Enum.group_by(fn {item, _price_cents} -> item.printing.card.oracle_id end)
      |> Enum.map(fn {_oracle_id, rows} ->
        card_pulls(rows, keep_copies, prefer_keep_foils, kept)
      end)
      |> Enum.reject(&(&1.pull_quantity == 0))
      |> Enum.sort_by(&{&1.card_name, &1.card_id})

    {:ok,
     %{
       max_price_cents: max_price_cents,
       min_copies: min_copies,
       keep_copies: keep_copies,
       prefer_keep_foils: prefer_keep_foils,
       card_count: length(cards),
       pull_quantity: Enum.sum_by(cards, & &1.pull_quantity),
       pull_value_cents: Enum.sum_by(cards, & &1.pull_value_cents),
       cards: cards
     }}
  end

  defp candidate_items(max_price_cents, min_copies) do
    qualifying_oracle_ids =
      max_price_cents
      |> loose_cheap_items()
      |> group_by([card: card], card.oracle_id)
      |> having([item], sum(item.quantity) >= ^min_copies)
      |> select([card: card], card.oracle_id)

    max_price_cents
    |> loose_cheap_items()
    |> where([card: card], card.oracle_id in subquery(qualifying_oracle_ids))
    |> preload([printing: printing, card: card, location: location],
      printing: {printing, card: card},
      location_assoc: location
    )
    |> select([item, printing: printing], {item, price_cents_fragment(item, printing)})
  end

  defp loose_cheap_items(max_price_cents) do
    allocated_item_ids = from(allocation in DeckAllocation, select: allocation.collection_item_id)

    from(item in CollectionItem,
      join: printing in assoc(item, :printing),
      as: :printing,
      join: card in assoc(printing, :card),
      as: :card,
      left_join: location in assoc(item, :location_assoc),
      as: :location,
      where: item.id not in subquery(allocated_item_ids),
      where: is_nil(location.id) or location.kind != "list",
      where: price_cents_fragment(item, printing) < ^max_price_cents
    )
  end

  def remove(pulls) when is_list(pulls) do
    Repo.transaction(fn ->
      Enum.reduce(pulls, 0, fn %{collection_item_id: id, quantity: quantity}, removed ->
        case remove_copies(id, quantity) do
          {:ok, _item} -> removed + quantity
          {:error, reason} -> Repo.rollback(reason)
        end
      end)
    end)
  end

  defp remove_copies(id, quantity) do
    item = Repo.get(CollectionItem, id)
    allocated? = Repo.exists?(from(a in DeckAllocation, where: a.collection_item_id == ^id))

    cond do
      is_nil(item) or allocated? or quantity < 1 or quantity > item.quantity ->
        {:error, :stale_pull}

      quantity == item.quantity ->
        Repo.delete(item)

      true ->
        item
        |> CollectionItem.update_changeset(%{quantity: item.quantity - quantity})
        |> Repo.update()
    end
  end

  defp card_pulls(rows, keep_copies, prefer_keep_foils, kept) do
    rows =
      Enum.sort_by(rows, fn {item, price_cents} ->
        foil_rank = if prefer_keep_foils and item.finish != "nonfoil", do: 1, else: 0
        {foil_rank, price_cents, -item.quantity, item.id}
      end)

    total_copies = Enum.sum_by(rows, fn {item, _price_cents} -> item.quantity end)
    pullable = fn item -> max(item.quantity - Map.get(kept, item.id, 0), 0) end
    pullable_copies = Enum.sum_by(rows, fn {item, _price_cents} -> pullable.(item) end)

    {pulls, _remaining} =
      Enum.flat_map_reduce(rows, min(max(total_copies - keep_copies, 0), pullable_copies), fn
        _row, 0 ->
          {[], 0}

        {item, price_cents}, remaining ->
          case min(pullable.(item), remaining) do
            0 -> {[], remaining}
            quantity -> {[pull(item, price_cents, quantity)], remaining - quantity}
          end
      end)

    pull_quantity = Enum.sum_by(pulls, & &1.quantity)

    {item, _price_cents} = hd(rows)

    %{
      card_id: item.printing.card.oracle_id,
      card_name: item.printing.card.name,
      type_line: item.printing.card.type_line,
      colors: Util.decode_json(item.printing.card.colors, []),
      image_url: image_url(item),
      total_copies: total_copies,
      pull_quantity: pull_quantity,
      swappable_copies: pullable_copies - pull_quantity,
      pull_value_cents: Enum.sum_by(pulls, &(&1.quantity * &1.price_cents)),
      pulls: pulls
    }
  end

  defp pull(%CollectionItem{} = item, price_cents, quantity) do
    {location_id, location_name} =
      case item.location_assoc do
        %Location{id: id, name: name} -> {id, name}
        nil -> {nil, "Unfiled"}
      end

    %{
      collection_item_id: item.id,
      card_id: item.printing.card.oracle_id,
      card_name: item.printing.card.name,
      set_code: item.printing.set_code,
      collector_number: item.printing.collector_number,
      image_url: image_url(item),
      finish: item.finish,
      price_cents: price_cents,
      owned_quantity: item.quantity,
      quantity: quantity,
      from_location_id: location_id,
      from_location_name: location_name
    }
  end

  defp image_url(%CollectionItem{printing: printing}) do
    case Util.decode_json(printing.image_uris, %{}) do
      [first | _rest] -> uri(first)
      uris -> uri(uris)
    end
  end

  defp uri(%{} = uris), do: uris["normal"] || uris["large"] || uris["small"] || uris["png"]
  defp uri(_uris), do: nil
end
