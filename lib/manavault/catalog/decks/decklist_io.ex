defmodule Manavault.Catalog.Decks.DecklistIO do
  @moduledoc false

  import Ecto.Query

  alias Ecto.Changeset
  alias Manavault.Catalog.{Card, Deck, DeckCard, Decklists, Printing, Util}
  alias Manavault.Catalog.Decks.{AllocationItems, Preloads}
  alias Manavault.Repo

  @lock_retry_attempts 3
  @lock_retry_sleep_ms 250

  def import_decklist(%Deck{} = deck, text, opts \\ []) when is_binary(text) and is_list(opts) do
    with {:ok, zone} <- import_zone(Keyword.get(opts, :zone)),
         {:ok, prepared} <- prepare_import_entries(text, zone) do
      import_with_lock_retry(deck, prepared, opts, @lock_retry_attempts)
    end
  end

  defp import_zone(nil), do: {:ok, nil}

  defp import_zone(zone) when is_binary(zone) do
    if zone in DeckCard.zones() do
      {:ok, zone}
    else
      {:error, "Unknown deck zone: #{zone}"}
    end
  end

  defp prepare_import_entries(text, zone) do
    entries = Decklists.parse(text, zone: zone)
    cards_by_name = cards_by_normalized_name(entries)
    printings_by_id = printings_by_id(entries)

    prepared =
      Enum.map(entries, fn entry ->
        prepare_import_entry(entry, cards_by_name, printings_by_id)
      end)

    {:ok, prepared}
  end

  defp prepare_import_entry(entry, cards_by_name, printings_by_id) do
    case Map.get(cards_by_name, normalized_name_key(entry["name"])) do
      nil ->
        {:unresolved, entry["name"]}

      %Card{} = card ->
        {preferred_printing_id, skipped_printing?} =
          preferred_printing_id(entry["preferred_printing_id"], card.oracle_id, printings_by_id)

        {:import,
         %{
           "deck_id" => nil,
           "oracle_id" => card.oracle_id,
           "quantity" => Util.parse_quantity(entry["quantity"]),
           "zone" => Map.get(entry, "zone", "mainboard"),
           "finish" => Map.get(entry, "finish", "nonfoil"),
           "preferred_printing_id" => preferred_printing_id,
           "name" => entry["name"],
           "skipped_printing?" => skipped_printing?
         }}
    end
  end

  defp preferred_printing_id(preferred_printing_id, oracle_id, printings_by_id)
       when is_binary(preferred_printing_id) do
    case Map.get(printings_by_id, preferred_printing_id) do
      %Printing{oracle_id: ^oracle_id} -> {preferred_printing_id, false}
      _missing_or_mismatch -> {nil, true}
    end
  end

  defp preferred_printing_id(_preferred_printing_id, _oracle_id, _printings_by_id),
    do: {nil, false}

  defp cards_by_normalized_name(entries) do
    names =
      entries
      |> Enum.map(&normalized_name_key(&1["name"]))
      |> Enum.reject(&(&1 == ""))
      |> Enum.uniq()

    Card
    |> where([card], fragment("lower(?)", card.name) in ^names)
    |> order_by([card], asc: card.name)
    |> Repo.all()
    |> Enum.reduce(%{}, fn card, cards ->
      Map.put_new(cards, normalized_name_key(card.name), card)
    end)
  end

  defp printings_by_id(entries) do
    printing_ids =
      entries
      |> Enum.map(& &1["preferred_printing_id"])
      |> Enum.filter(&is_binary/1)
      |> Enum.uniq()

    Printing
    |> where([printing], printing.scryfall_id in ^printing_ids)
    |> Repo.all()
    |> Map.new(&{&1.scryfall_id, &1})
  end

  defp import_with_lock_retry(deck, prepared, opts, attempts_left) do
    transact_import(deck, prepared, opts)
  rescue
    error in Exqlite.Error ->
      if lock_error?(error) and attempts_left > 0 do
        Process.sleep(@lock_retry_sleep_ms)
        import_with_lock_retry(deck, prepared, opts, attempts_left - 1)
      else
        reraise(error, __STACKTRACE__)
      end
  end

  defp lock_error?(error), do: Exception.message(error) =~ "database is locked"

  defp transact_import(%Deck{} = deck, prepared, opts) do
    replace? = Keyword.get(opts, :replace?, false)

    Repo.transact(fn ->
      if replace?, do: delete_deck_cards_for_import!(deck)

      {result, _deck_cards_by_key} =
        Enum.reduce(
          prepared,
          {empty_import_result(), existing_deck_cards_by_key(deck, prepared)},
          fn
            {:unresolved, name}, {result, deck_cards_by_key} ->
              {update_in(result.unresolved, &[name | &1]), deck_cards_by_key}

            {:import, attrs}, {result, deck_cards_by_key} ->
              attrs = Map.put(attrs, "deck_id", deck.id)

              case upsert_import_deck_card(attrs, deck_cards_by_key) do
                {:ok, deck_card} ->
                  result =
                    result
                    |> update_in([:imported], &(&1 + 1))
                    |> maybe_track_skipped_printing(attrs)

                  {result, Map.put(deck_cards_by_key, deck_card_key(deck_card), deck_card)}

                {:error, %Changeset{} = changeset} ->
                  Repo.rollback(changeset)

                {:error, reason} ->
                  Repo.rollback(reason)
              end
          end
        )

      {:ok,
       result
       |> update_in([:unresolved], &Enum.reverse/1)
       |> update_in([:skipped_printings], &Enum.reverse/1)}
    end)
  end

  defp empty_import_result, do: %{imported: 0, unresolved: [], skipped_printings: []}

  defp maybe_track_skipped_printing(result, %{"skipped_printing?" => true, "name" => name}) do
    update_in(result.skipped_printings, &[name | &1])
  end

  defp maybe_track_skipped_printing(result, _attrs), do: result

  defp existing_deck_cards_by_key(%Deck{id: deck_id}, prepared) do
    keys =
      prepared
      |> Enum.flat_map(fn
        {:import, attrs} -> [{attrs["oracle_id"], attrs["zone"]}]
        {:unresolved, _name} -> []
      end)
      |> Enum.uniq()

    oracle_ids = Enum.map(keys, &elem(&1, 0))
    zones = Enum.map(keys, &elem(&1, 1))

    DeckCard
    |> where([deck_card], deck_card.deck_id == ^deck_id)
    |> where([deck_card], deck_card.oracle_id in ^oracle_ids)
    |> where([deck_card], deck_card.zone in ^zones)
    |> Repo.all()
    |> Map.new(&{deck_card_key(&1), &1})
  end

  defp upsert_import_deck_card(attrs, deck_cards_by_key) do
    case Map.get(deck_cards_by_key, deck_card_key(attrs)) do
      nil ->
        attrs
        |> import_deck_card_attrs()
        |> then(&DeckCard.changeset(%DeckCard{}, &1))
        |> Repo.insert()

      %DeckCard{} = deck_card ->
        deck_card
        |> DeckCard.changeset(import_deck_card_update_attrs(deck_card, attrs))
        |> Repo.update()
    end
  end

  defp import_deck_card_attrs(attrs) do
    Map.take(attrs, [
      "deck_id",
      "oracle_id",
      "quantity",
      "zone",
      "finish",
      "preferred_printing_id"
    ])
  end

  defp import_deck_card_update_attrs(%DeckCard{} = deck_card, attrs) do
    attrs
    |> Map.put("quantity", deck_card.quantity + attrs["quantity"])
    |> Map.take(["quantity", "preferred_printing_id", "zone", "finish"])
    |> Enum.reject(fn {key, value} ->
      key == "preferred_printing_id" and is_nil(value)
    end)
    |> Map.new()
  end

  defp delete_deck_cards_for_import!(%Deck{} = deck) do
    deck =
      deck
      |> Repo.preload([deck_cards: [deck_allocations: [:collection_item]]], force: true)

    Enum.each(deck.deck_cards, fn deck_card ->
      Enum.each(deck_card.deck_allocations, &restore_deck_allocation!/1)

      case Repo.delete(deck_card) do
        {:ok, _deck_card} -> :ok
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  defp restore_deck_allocation!(allocation) do
    AllocationItems.restore_from_deck!(
      allocation.collection_item,
      allocation.quantity,
      allocation.source_location_id
    )

    case Repo.delete(allocation) do
      {:ok, _allocation} -> :ok
      {:error, changeset} -> Repo.rollback(changeset)
    end
  end

  def export_decklist(%Deck{} = deck) do
    deck
    |> Repo.preload(Preloads.deck_preloads(), force: true)
    |> Map.fetch!(:deck_cards)
    |> Decklists.export()
  end

  defp deck_card_key(%DeckCard{} = deck_card), do: {deck_card.oracle_id, deck_card.zone}
  defp deck_card_key(%{"oracle_id" => oracle_id, "zone" => zone}), do: {oracle_id, zone}

  defp normalized_name_key(name) when is_binary(name) do
    name
    |> Decklists.normalize_card_name()
    |> String.downcase()
  end

  defp normalized_name_key(_name), do: ""
end
