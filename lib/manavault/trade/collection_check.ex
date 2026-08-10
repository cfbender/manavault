defmodule Manavault.Trade.CollectionCheck do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog
  alias Manavault.Catalog.{Card, DeckCard, Price, Printing}
  alias Manavault.Repo
  alias Manavault.Trade.EntryResolver

  def check(source_name, entries, opts \\ []) when is_list(entries) do
    include_considering = Keyword.get(opts, :include_considering, false)
    {included_entries, excluded_entries} = split_entries(entries, include_considering)

    with {:ok, resolved} <- EntryResolver.resolve(included_entries) do
      rows = build_rows(resolved.entries)

      {:ok,
       rows
       |> summarize()
       |> Map.merge(%{
         source_name: source_name,
         entry_count: length(included_entries),
         excluded_quantity: total_quantity(excluded_entries),
         requested_quantity: total_quantity(included_entries),
         unrecognized: resolved.unrecognized,
         cards: rows
       })}
    end
  end

  defp split_entries(entries, true), do: {entries, []}

  defp split_entries(entries, false) do
    Enum.split_with(entries, &(Map.get(&1, :zone) != "considering"))
  end

  defp build_rows(entries) do
    requirements = aggregate_requirements(entries)
    cards_by_oracle = cards_by_oracle(Map.keys(requirements))

    deck_cards =
      Enum.flat_map(requirements, fn {oracle_id, requirement} ->
        case Map.get(cards_by_oracle, oracle_id) do
          %Card{} = card ->
            [
              %DeckCard{
                oracle_id: oracle_id,
                quantity: requirement.quantity,
                proxy_quantity: 0,
                finish: "nonfoil",
                card: card
              }
            ]

          nil ->
            []
        end
      end)

    statuses = Catalog.collection_requirement_statuses(deck_cards)

    deck_cards
    |> Enum.map(fn deck_card ->
      requirement = Map.fetch!(requirements, deck_card.oracle_id)
      status = Map.fetch!(statuses, deck_card.oracle_id)
      requirement_row(requirement.card_name, deck_card, status)
    end)
    |> Enum.sort_by(&{status_rank(&1.status), String.downcase(&1.card_name)})
  end

  defp aggregate_requirements(entries) do
    entries
    |> Enum.reject(&is_nil(&1.oracle_id))
    |> Enum.reduce(%{}, fn entry, requirements ->
      Map.update(
        requirements,
        entry.oracle_id,
        %{card_name: entry.name, quantity: entry.quantity},
        fn existing -> %{existing | quantity: existing.quantity + entry.quantity} end
      )
    end)
  end

  defp cards_by_oracle([]), do: %{}

  defp cards_by_oracle(oracle_ids) do
    Card
    |> where([card], card.oracle_id in ^oracle_ids)
    |> preload(:printings)
    |> Repo.all()
    |> Map.new(&{&1.oracle_id, &1})
  end

  defp requirement_row(card_name, deck_card, status) do
    required = deck_card.quantity
    basic_land = status.state == :basic_land
    available = if basic_land, do: required, else: min(required, status.available)
    needed = max(required - available, 0)
    unavailable = min(needed, status.allocated_elsewhere)
    missing = max(needed - unavailable, 0)
    {printing, unit_price_cents} = priced_printing(deck_card.card)
    total_price_cents = price_total_cents(unit_price_cents, needed)

    %{
      card_name: card_name,
      oracle_id: deck_card.oracle_id,
      required: required,
      owned: status.owned,
      available: available,
      unavailable: unavailable,
      missing: missing,
      to_source: needed,
      status: row_status(basic_land, available, unavailable, missing),
      printing: printing,
      set_code: printing && printing.set_code,
      collector_number: printing && printing.collector_number,
      unit_price_cents: unit_price_cents,
      unit_price_text: Price.format_cents(unit_price_cents),
      total_price_cents: total_price_cents,
      total_price_text: Price.format_cents(total_price_cents)
    }
  end

  defp priced_printing(%Card{printings: printings}) when is_list(printings) do
    priced =
      printings
      |> Enum.map(&{&1, Price.price_cents_for_printing(&1)})
      |> Enum.reject(fn {_printing, price} -> is_nil(price) end)
      |> Enum.sort_by(fn {printing, price} ->
        {price, printing.released_at || ~D[9999-12-31], printing.set_code || "",
         printing.collector_number || ""}
      end)
      |> List.first()

    case priced do
      {%Printing{} = printing, price} -> {printing, price}
      nil -> {representative_printing(printings), nil}
    end
  end

  defp priced_printing(_card), do: {nil, nil}

  defp representative_printing(printings) do
    Enum.min_by(
      printings,
      &{&1.released_at || ~D[9999-12-31], &1.set_code || "", &1.collector_number || ""},
      fn -> nil end
    )
  end

  defp price_total_cents(nil, _quantity), do: nil
  defp price_total_cents(price_cents, quantity), do: price_cents * quantity

  defp row_status(true, _available, _unavailable, _missing), do: "basic_land"
  defp row_status(false, _available, 0, 0), do: "ready"
  defp row_status(false, available, _unavailable, _missing) when available > 0, do: "partial"
  defp row_status(false, 0, unavailable, 0) when unavailable > 0, do: "allocated_elsewhere"
  defp row_status(false, _available, _unavailable, _missing), do: "missing"

  defp status_rank("missing"), do: 0
  defp status_rank("partial"), do: 1
  defp status_rank("allocated_elsewhere"), do: 2
  defp status_rank("ready"), do: 3
  defp status_rank("basic_land"), do: 4

  defp summarize(rows) do
    summary =
      Enum.reduce(
        rows,
        %{
          available_quantity: 0,
          unavailable_quantity: 0,
          missing_quantity: 0,
          estimated_cost_cents: 0,
          unpriced_quantity: 0
        },
        fn row, summary ->
          summary
          |> Map.update!(:available_quantity, &(&1 + row.available))
          |> Map.update!(:unavailable_quantity, &(&1 + row.unavailable))
          |> Map.update!(:missing_quantity, &(&1 + row.missing))
          |> add_estimated_cost(row)
        end
      )

    Map.put(summary, :estimated_cost_text, Price.format_cents(summary.estimated_cost_cents))
  end

  defp add_estimated_cost(summary, %{to_source: quantity, total_price_cents: nil}) do
    Map.update!(summary, :unpriced_quantity, &(&1 + quantity))
  end

  defp add_estimated_cost(summary, %{total_price_cents: total_price_cents}) do
    Map.update!(summary, :estimated_cost_cents, &(&1 + total_price_cents))
  end

  defp total_quantity(entries), do: Enum.reduce(entries, 0, &(&1.quantity + &2))
end
