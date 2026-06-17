defmodule Manavault.Catalog do
  @moduledoc """
  Local Scryfall catalog storage and sync functions.
  """

  import Ecto.Query
  require Logger

  alias Manavault.Catalog.{
    Card,
    CollectionItem,
    Deck,
    DeckAllocation,
    DeckCard,
    Location,
    Price,
    Printing,
    ScanItem,
    ScanRecognition,
    ScanSession,
    Sync
  }

  alias Manavault.Repo

  @bulk_metadata_url "https://api.scryfall.com/bulk-data/default-cards"
  @bulk_type "default_cards"
  @batch_size 200
  @card_name_cache_key {__MODULE__, :card_name_suggestions, 2}
  @reserving_deck_statuses ["active"]
  @suggestion_candidate_limit 250

  def search_cards(term, opts \\ []) when is_binary(term) do
    limit = Keyword.get(opts, :limit, 20)
    pattern = "%#{String.downcase(term)}%"

    Card
    |> where([card], fragment("lower(?) LIKE ?", card.name, ^pattern))
    |> order_by([card], asc: card.name)
    |> limit(^limit)
    |> Repo.all()
    |> Repo.preload(printings: from(printing in Printing, order_by: [desc: printing.released_at]))
  end

  def suggest_card_names(term, opts \\ []) when is_binary(term) do
    limit = Keyword.get(opts, :limit, 5)
    normalized_term = normalize_card_suggestion(term)

    if normalized_term == "" do
      []
    else
      candidate_limit = Keyword.get(opts, :candidate_limit, @suggestion_candidate_limit)

      normalized_term
      |> card_name_suggestion_candidates(candidate_limit)
      |> Enum.map(fn %{name: name} -> {card_name_match_score(normalized_term, name), name} end)
      |> Enum.sort_by(fn {score, name} -> {score, String.downcase(name)} end)
      |> Enum.take(limit)
      |> Enum.map(fn {_score, name} -> name end)
    end
  end

  def get_printing_by_scryfall_id(scryfall_id) when is_binary(scryfall_id) do
    Printing
    |> Repo.get(scryfall_id)
    |> Repo.preload(:card)
  end

  def get_printing(set_code, collector_number)
      when is_binary(set_code) and is_binary(collector_number) do
    Repo.one(
      from printing in Printing,
        where:
          printing.set_code == ^String.downcase(set_code) and
            printing.collector_number == ^collector_number,
        limit: 1
    )
  end

  def get_card_with_printings(oracle_id) when is_binary(oracle_id) do
    case Repo.get(Card, oracle_id) do
      nil ->
        nil

      card ->
        Repo.preload(card,
          printings: from(printing in Printing, order_by: [desc: printing.released_at])
        )
    end
  end

  def search_printings(filters, opts \\ []) when is_list(filters) do
    limit = Keyword.get(opts, :limit, 50)
    name = filters |> Keyword.get(:name, "") |> normalize_filter()
    set_code = filters |> Keyword.get(:set_code, "") |> normalize_filter() |> String.downcase()
    collector_number = filters |> Keyword.get(:collector_number, "") |> normalize_filter()

    if name == "" and set_code == "" and collector_number == "" do
      []
    else
      Printing
      |> join(:inner, [printing], card in assoc(printing, :card))
      |> maybe_filter_card_name(name)
      |> maybe_filter_set_code(set_code)
      |> maybe_filter_collector_number(collector_number)
      |> preload([_printing, card], card: card)
      |> order_by([printing, card],
        asc: card.name,
        asc: printing.set_code,
        asc: printing.collector_number
      )
      |> limit(^limit)
      |> Repo.all()
    end
  end

  def list_collection_items(filters \\ [], opts \\ []) when is_list(filters) do
    limit = Keyword.get(opts, :limit, 100)
    offset = Keyword.get(opts, :offset, 0)
    query = filters |> Keyword.get(:q, "") |> normalize_filter()
    condition = filters |> Keyword.get(:condition, "") |> normalize_filter()
    language = filters |> Keyword.get(:language, "") |> normalize_filter()
    finish = filters |> Keyword.get(:finish, "") |> normalize_filter()
    location_id = filters |> Keyword.get(:location_id, "") |> normalize_filter()

    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:inner, [item, printing], card in assoc(printing, :card))
    |> join(:left, [item, _printing, _card], location in assoc(item, :location_assoc))
    |> maybe_filter_collection_search(query)
    |> maybe_filter_collection_condition(condition)
    |> maybe_filter_collection_language(language)
    |> maybe_filter_collection_finish(finish)
    |> maybe_filter_collection_location(location_id)
    |> preload([_item, printing, card, location],
      printing: {printing, card: card},
      location_assoc: location
    )
    |> order_by([item, printing, card, _location],
      asc: card.name,
      asc: printing.set_code,
      asc: printing.collector_number,
      asc: item.id
    )
    |> limit(^limit)
    |> offset(^offset)
    |> Repo.all()
  end

  def get_collection_item!(id) do
    CollectionItem
    |> Repo.get!(id)
    |> Repo.preload(printing: :card, location_assoc: [])
  end

  def change_collection_item(collection_item, attrs \\ %{})

  def change_collection_item(%CollectionItem{id: nil} = collection_item, attrs) do
    CollectionItem.create_changeset(collection_item, attrs)
  end

  def change_collection_item(%CollectionItem{} = collection_item, attrs) do
    CollectionItem.update_changeset(collection_item, attrs)
  end

  def new_collection_item_for_printing(scryfall_id) when is_binary(scryfall_id) do
    case get_printing_by_scryfall_id(scryfall_id) do
      nil ->
        nil

      printing ->
        CollectionItem.create_changeset(%CollectionItem{}, default_collection_attrs(printing))
    end
  end

  def create_collection_item(attrs) when is_map(attrs) do
    %CollectionItem{}
    |> CollectionItem.create_changeset(attrs)
    |> validate_collection_finish_available()
    |> Repo.insert()
  end

  def update_collection_item(%CollectionItem{} = collection_item, attrs) when is_map(attrs) do
    collection_item
    |> CollectionItem.update_changeset(attrs)
    |> validate_collection_finish_available()
    |> Repo.update()
  end

  def list_printings_for_collection_item(%CollectionItem{
        printing: %{card: %{oracle_id: oracle_id}}
      }) do
    list_printings_for_oracle_id(oracle_id)
  end

  def list_printings_for_collection_item(%CollectionItem{printing: %{oracle_id: oracle_id}}) do
    list_printings_for_oracle_id(oracle_id)
  end

  def list_printings_for_collection_item(%CollectionItem{scryfall_id: scryfall_id}) do
    case get_printing_by_scryfall_id(scryfall_id) do
      nil -> []
      %Printing{oracle_id: oracle_id} -> list_printings_for_oracle_id(oracle_id)
    end
  end

  def list_printings_for_scan_item(%ScanItem{accepted_printing: %{card: %{oracle_id: oracle_id}}}) do
    list_printings_for_oracle_id(oracle_id)
  end

  def list_printings_for_scan_item(%ScanItem{accepted_printing: %{oracle_id: oracle_id}}) do
    list_printings_for_oracle_id(oracle_id)
  end

  def list_printings_for_scan_item(%ScanItem{accepted_printing_id: scryfall_id})
      when is_binary(scryfall_id) do
    case get_printing_by_scryfall_id(scryfall_id) do
      nil -> []
      %Printing{oracle_id: oracle_id} -> list_printings_for_oracle_id(oracle_id)
    end
  end

  def list_printings_for_scan_item(_scan_item), do: []

  def switch_collection_item_printing(%CollectionItem{} = collection_item, scryfall_id)
      when is_binary(scryfall_id) do
    attrs = switch_collection_attrs(collection_item, scryfall_id)

    collection_item
    |> CollectionItem.switch_printing_changeset(attrs)
    |> validate_collection_finish_available()
    |> Repo.update()
  end

  def delete_collection_item(%CollectionItem{} = collection_item) do
    Repo.delete(collection_item)
  end

  def delete_scan_item(%ScanItem{} = scan_item) do
    Repo.delete(scan_item)
  end

  def delete_scan_session(%ScanSession{} = scan_session) do
    Repo.delete(scan_session)
  end

  # ── Locations ──────────────────────────────────────────────────────

  def list_locations(_opts \\ []) do
    Location
    |> order_by(asc: :name)
    |> Repo.all()
    |> Repo.preload(
      cover_printing: [],
      collection_items:
        from(item in CollectionItem,
          join: printing in assoc(item, :printing),
          join: card in assoc(printing, :card),
          preload: [printing: {printing, card: card}],
          order_by: [asc: card.name, asc: printing.set_code, asc: printing.collector_number]
        )
    )
  end

  def list_location_options do
    Location
    |> order_by(asc: :name)
    |> select([location], %{id: location.id, name: location.name})
    |> Repo.all()
  end

  def get_location!(id) do
    Location |> Repo.get!(id)
  end

  def get_location_with_items!(id) do
    Location
    |> Repo.get!(id)
    |> Repo.preload(
      collection_items:
        from(item in CollectionItem,
          join: printing in assoc(item, :printing),
          join: card in assoc(printing, :card),
          preload: [printing: {printing, card: card}],
          order_by: [asc: card.name, asc: printing.set_code, asc: printing.collector_number]
        )
    )
  end

  def list_collection_items_by_location(location_id, filters \\ [], opts \\ [])
      when is_list(filters) do
    limit = Keyword.get(opts, :limit, 100)
    query = filters |> Keyword.get(:q, "") |> normalize_filter()

    CollectionItem
    |> where(location_id: ^location_id)
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:inner, [_item, printing], card in assoc(printing, :card))
    |> maybe_filter_collection_search(query)
    |> preload([_item, printing, card],
      printing: {printing, card: card}
    )
    |> order_by([item, printing, card],
      asc: card.name,
      asc: printing.set_code,
      asc: printing.collector_number,
      asc: item.id
    )
    |> limit(^limit)
    |> Repo.all()
  end

  def change_location(location, attrs \\ %{}) do
    Location.changeset(location, attrs)
  end

  def create_location(attrs \\ %{}) do
    %Location{}
    |> Location.changeset(attrs)
    |> Repo.insert()
  end

  def update_location(%Location{} = location, attrs) do
    location
    |> Location.changeset(attrs)
    |> Repo.update()
  end

  def delete_location(%Location{} = location) do
    Repo.delete(location)
  end

  def add_printing_to_collection(scryfall_id, attrs \\ %{})
      when is_binary(scryfall_id) and is_map(attrs) do
    attrs
    |> Map.new(fn {key, value} -> {to_string(key), value} end)
    |> Map.put("scryfall_id", scryfall_id)
    |> create_collection_item()
  end

  # ── Decks ─────────────────────────────────────────────────────────

  def list_decks do
    Deck
    |> order_by([deck], asc: deck.name, asc: deck.id)
    |> Repo.all()
    |> Repo.preload(deck_preloads())
  end

  def get_deck!(id) do
    Deck
    |> Repo.get!(id)
    |> Repo.preload(deck_preloads())
  end

  def change_deck(%Deck{} = deck, attrs \\ %{}) do
    Deck.changeset(deck, attrs)
  end

  def create_deck(attrs) when is_map(attrs) do
    %Deck{}
    |> Deck.changeset(attrs)
    |> Repo.insert()
  end

  def update_deck(%Deck{} = deck, attrs) when is_map(attrs) do
    deck
    |> Deck.changeset(attrs)
    |> Repo.update()
  end

  def delete_deck(%Deck{} = deck) do
    Repo.delete(deck)
  end

  def deck_reserves_cards?(%Deck{status: status}), do: deck_reserves_cards?(status)
  def deck_reserves_cards?(status) when is_binary(status), do: status in @reserving_deck_statuses

  def change_deck_card(%DeckCard{} = deck_card, attrs \\ %{}) do
    DeckCard.changeset(deck_card, attrs)
  end

  def add_card_to_deck(%Deck{} = deck, attrs) when is_map(attrs) do
    attrs =
      attrs
      |> stringify_keys()
      |> Map.put_new("deck_id", deck.id)
      |> normalize_blank_preferred_printing()

    with {:ok, attrs} <- resolve_deck_card_identity(attrs),
         {:ok, attrs} <- validate_preferred_printing_identity(attrs) do
      upsert_deck_card(attrs)
    end
  end

  def update_deck_card(%DeckCard{} = deck_card, attrs) when is_map(attrs) do
    attrs =
      attrs
      |> stringify_keys()
      |> normalize_blank_preferred_printing()

    attrs =
      attrs
      |> Map.put_new("deck_id", deck_card.deck_id)
      |> Map.put_new("oracle_id", deck_card.oracle_id)

    with {:ok, attrs} <- validate_preferred_printing_identity(attrs) do
      deck_card
      |> DeckCard.changeset(attrs)
      |> Repo.update()
    end
  end

  def delete_deck_card(%DeckCard{} = deck_card) do
    Repo.delete(deck_card)
  end

  def deck_allocation_status(%Deck{} = deck) do
    deck
    |> Repo.preload(deck_preloads(), force: true)
    |> Map.fetch!(:deck_cards)
    |> Map.new(fn deck_card ->
      {deck_card.id, deck_card_allocation_status(deck_card)}
    end)
  end

  def deck_card_allocation_status(%DeckCard{} = deck_card) do
    deck_card =
      Repo.preload(deck_card, [:deck, :preferred_printing, card: [], deck_allocations: []])

    candidates = deck_card_collection_candidates(deck_card)
    current_allocations = current_allocation_counts(deck_card.id)
    other_allocations = other_reserving_allocation_counts(deck_card)

    owned = Enum.reduce(candidates, 0, &(&1.quantity + &2))
    allocated = current_allocations |> Map.values() |> Enum.sum()
    allocated_elsewhere = other_allocations |> Map.values() |> Enum.sum()

    available =
      Enum.reduce(candidates, 0, fn item, total ->
        current = Map.get(current_allocations, item.id, 0)
        elsewhere = Map.get(other_allocations, item.id, 0)
        total + max(item.quantity - current - elsewhere, 0)
      end)

    missing = allocation_missing(deck_card, allocated, available)

    %{
      state: allocation_state(deck_card, allocated, available, owned),
      required: deck_card.quantity,
      owned: owned,
      allocated: allocated,
      available: available,
      allocated_elsewhere: allocated_elsewhere,
      missing: missing,
      candidates:
        Enum.map(candidates, fn item ->
          current = Map.get(current_allocations, item.id, 0)
          elsewhere = Map.get(other_allocations, item.id, 0)

          %{
            item: item,
            allocated: current,
            allocated_elsewhere: elsewhere,
            available: max(item.quantity - current - elsewhere, 0)
          }
        end)
    }
  end

  def allocate_collection_item_to_deck_card(deck_card_id, collection_item_id, quantity \\ 1) do
    quantity = parse_quantity(quantity)

    Repo.transaction(fn ->
      deck_card =
        DeckCard |> Repo.get!(deck_card_id) |> Repo.preload([:deck, :preferred_printing])

      item = get_collection_item!(collection_item_id)

      with :ok <- validate_collection_item_matches_deck_card(item, deck_card),
           :ok <- validate_deck_card_allocation_room(deck_card, item, quantity) do
        source_location_id = item.location_id
        allocated_item = move_collection_item_to_deck!(item, quantity)

        allocation =
          Repo.one(
            from allocation in DeckAllocation,
              where:
                allocation.deck_card_id == ^deck_card.id and
                  allocation.collection_item_id == ^allocated_item.id,
              limit: 1
          )

        attrs = %{
          "deck_card_id" => deck_card.id,
          "collection_item_id" => allocated_item.id,
          "source_location_id" => source_location_id,
          "quantity" => quantity
        }

        result =
          case allocation do
            nil ->
              %DeckAllocation{}
              |> DeckAllocation.changeset(attrs)
              |> Repo.insert()

            %DeckAllocation{} = allocation ->
              allocation
              |> DeckAllocation.changeset(%{"quantity" => allocation.quantity + quantity})
              |> Repo.update()
          end

        case result do
          {:ok, allocation} -> allocation
          {:error, changeset} -> Repo.rollback(changeset)
        end
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  def deallocate_collection_item_from_deck_card(deck_card_id, collection_item_id, quantity \\ 1) do
    quantity = parse_quantity(quantity)

    Repo.transaction(fn ->
      allocation =
        Repo.one(
          from allocation in DeckAllocation,
            where:
              allocation.deck_card_id == ^deck_card_id and
                allocation.collection_item_id == ^collection_item_id,
            limit: 1
        )

      case allocation do
        nil ->
          Repo.rollback(:allocation_not_found)

        %DeckAllocation{quantity: allocation_quantity} when allocation_quantity <= quantity ->
          allocation = Repo.preload(allocation, :collection_item)

          restore_collection_item_from_deck!(
            allocation.collection_item,
            allocation_quantity,
            allocation.source_location_id
          )

          case Repo.delete(allocation) do
            {:ok, _allocation} -> allocation
            {:error, changeset} -> Repo.rollback(changeset)
          end

        %DeckAllocation{} = allocation ->
          allocation = Repo.preload(allocation, :collection_item)

          restore_collection_item_from_deck!(
            allocation.collection_item,
            quantity,
            allocation.source_location_id
          )

          case allocation
               |> DeckAllocation.changeset(%{"quantity" => allocation.quantity - quantity})
               |> Repo.update() do
            {:ok, updated_allocation} -> updated_allocation
            {:error, changeset} -> Repo.rollback(changeset)
          end
      end
    end)
  end

  def bulk_allocate_deck(%Deck{} = deck, mode)
      when mode in [:exact_printings, :matching_printings] do
    with {:ok, preview} <- preview_bulk_allocate_deck(deck, mode) do
      result =
        Enum.reduce(preview.entries, %{allocated: 0, cards: MapSet.new(), skipped: 0}, fn entry,
                                                                                          counts ->
          case allocate_collection_item_to_deck_card(
                 entry.deck_card.id,
                 entry.item.id,
                 entry.quantity
               ) do
            {:ok, _allocation} ->
              counts
              |> update_in([:allocated], &(&1 + entry.quantity))
              |> update_in([:cards], &MapSet.put(&1, entry.deck_card.id))

            {:error, _reason} ->
              update_in(counts, [:skipped], &(&1 + 1))
          end
        end)

      {:ok,
       %{allocated: result.allocated, cards: MapSet.size(result.cards), skipped: result.skipped}}
    end
  end

  def bulk_allocate_deck(%Deck{} = deck, mode) when is_binary(mode) do
    case mode do
      "exact_printings" -> bulk_allocate_deck(deck, :exact_printings)
      "matching_printings" -> bulk_allocate_deck(deck, :matching_printings)
      _other -> {:error, :invalid_allocation_mode}
    end
  end

  def preview_bulk_allocate_deck(%Deck{} = deck, mode)
      when mode in [:exact_printings, :matching_printings] do
    deck = Repo.preload(deck, deck_preloads(), force: true)

    preview =
      deck.deck_cards
      |> Enum.reduce(%{allocated: 0, cards: MapSet.new(), skipped: 0, entries: []}, fn deck_card,
                                                                                       preview ->
        entries = bulk_allocate_deck_card_preview(deck_card, mode)

        if entries == [] do
          update_in(preview, [:skipped], &(&1 + 1))
        else
          allocated = Enum.reduce(entries, 0, &(&1.quantity + &2))

          preview
          |> update_in([:allocated], &(&1 + allocated))
          |> update_in([:cards], &MapSet.put(&1, deck_card.id))
          |> update_in([:entries], &(&1 ++ entries))
        end
      end)

    {:ok, %{preview | cards: MapSet.size(preview.cards)} |> Map.put(:mode, mode)}
  end

  def preview_bulk_allocate_deck(%Deck{} = deck, mode) when is_binary(mode) do
    case mode do
      "exact_printings" -> preview_bulk_allocate_deck(deck, :exact_printings)
      "matching_printings" -> preview_bulk_allocate_deck(deck, :matching_printings)
      _other -> {:error, :invalid_allocation_mode}
    end
  end

  def import_decklist(%Deck{} = deck, text) when is_binary(text) do
    entries = text |> parse_decklist() |> dedupe_decklist_entries()

    Repo.transaction(fn ->
      Enum.reduce(entries, %{imported: 0, unresolved: [], skipped_printings: []}, fn entry,
                                                                                     result ->
        case import_deck_card(deck, entry) do
          {:ok, _deck_card} ->
            update_in(result.imported, &(&1 + 1))

          {:ok, _deck_card, :skipped_preferred_printing} ->
            result
            |> update_in([:imported], &(&1 + 1))
            |> update_in([:skipped_printings], &[entry["name"] | &1])

          {:error, :card_not_found} ->
            update_in(result.unresolved, &[entry["name"] | &1])

          {:error, %Ecto.Changeset{} = changeset} ->
            Repo.rollback(changeset)

          {:error, reason} ->
            Repo.rollback(reason)
        end
      end)
      |> update_in([:unresolved], &Enum.reverse/1)
      |> update_in([:skipped_printings], &Enum.reverse/1)
    end)
  end

  def export_decklist(%Deck{} = deck) do
    deck = Repo.preload(deck, deck_preloads(), force: true)

    DeckCard.zones()
    |> Enum.map(fn zone ->
      cards = Enum.filter(deck.deck_cards, &(&1.zone == zone))

      if cards == [] do
        nil
      else
        lines =
          cards
          |> Enum.sort_by(& &1.card.name)
          |> Enum.map_join("\n", fn deck_card ->
            "#{deck_card.quantity} #{deck_card.card.name}"
          end)

        "#{deck_zone_label(zone)}\n#{lines}"
      end
    end)
    |> Enum.reject(&is_nil/1)
    |> Enum.join("\n\n")
  end

  def deck_buylist(%Deck{} = deck, opts \\ []) when is_list(opts) do
    deck = Repo.preload(deck, deck_preloads(), force: true)
    printing_mode = Keyword.get(opts, :printing_mode, :none)
    include_basic_lands = Keyword.get(opts, :include_basic_lands, false)

    deck.deck_cards
    |> Enum.map(fn deck_card ->
      status = deck_card_allocation_status(deck_card)
      needed = max(status.required - status.allocated - status.available, 0)
      unavailable = min(needed, status.allocated_elsewhere)
      missing = max(needed - unavailable, 0)

      if needed > 0 and (include_basic_lands or !is_basic_land?(deck_card)) do
        printing = buylist_printing(deck_card, printing_mode)
        unit_price_cents = Price.price_cents_for_printing(printing, deck_card.finish)

        %{
          deck_card: deck_card,
          card_name: deck_card.card.name,
          quantity: needed,
          missing: missing,
          unavailable: unavailable,
          reason: buylist_reason(missing, unavailable),
          finish: deck_card.finish,
          printing: printing,
          set_code: printing && printing.set_code,
          collector_number: printing && printing.collector_number,
          language: printing && printing.lang,
          unit_price_cents: unit_price_cents,
          total_price_cents: price_total_cents(unit_price_cents, needed)
        }
      end
    end)
    |> Enum.reject(&is_nil/1)
    |> Enum.sort_by(&{&1.card_name, &1.set_code || "", &1.collector_number || ""})
  end

  def export_deck_buylist(deck, format, opts \\ [])

  def export_deck_buylist(%Deck{} = deck, :text, opts) do
    deck
    |> deck_buylist(opts)
    |> Enum.map_join("\n", fn entry ->
      printing =
        if entry.set_code && entry.collector_number do
          " (#{String.upcase(entry.set_code)} #{entry.collector_number})"
        else
          ""
        end

      "#{entry.quantity} #{entry.card_name}#{printing}"
    end)
  end

  def export_deck_buylist(%Deck{} = deck, :csv, opts) do
    rows =
      deck
      |> deck_buylist(opts)
      |> Enum.map(fn entry ->
        [
          entry.quantity,
          entry.card_name,
          entry.set_code || "",
          entry.collector_number || "",
          entry.finish,
          entry.language || "",
          entry.reason,
          Price.format_cents(entry.unit_price_cents),
          Price.format_cents(entry.total_price_cents)
        ]
      end)

    [
      [
        "Quantity",
        "Card",
        "Set",
        "Collector Number",
        "Finish",
        "Language",
        "Reason",
        "Unit Price",
        "Total Price"
      ]
      | rows
    ]
    |> Enum.map_join("\n", &csv_row/1)
  end

  def export_deck_buylist(%Deck{} = deck, format, opts) when is_binary(format) do
    case format do
      "text" -> export_deck_buylist(deck, :text, opts)
      "csv" -> export_deck_buylist(deck, :csv, opts)
      _other -> ""
    end
  end

  def deck_stats(%Deck{} = deck) do
    deck = Repo.preload(deck, deck_preloads(), force: true)

    cards = deck.deck_cards || []

    %{
      total: Enum.reduce(cards, 0, &(&1.quantity + &2)),
      zones: count_deck_groups(cards, & &1.zone),
      colors: deck_color_counts(cards),
      types: count_deck_groups(cards, &deck_card_type/1)
    }
  end

  # ── Scan sessions ─────────────────────────────────────────────────

  def list_scan_sessions do
    ScanSession
    |> order_by([session], desc: session.inserted_at, desc: session.id)
    |> Repo.all()
    |> Repo.preload(:default_location)
  end

  def get_scan_session!(id) do
    ScanSession
    |> Repo.get!(id)
    |> Repo.preload(scan_session_preloads())
  end

  def change_scan_session(scan_session, attrs \\ %{}) do
    ScanSession.changeset(scan_session, attrs)
  end

  def generated_scan_session_name do
    base_name =
      DateTime.utc_now()
      |> Calendar.strftime("%m/%d/%Y")

    existing_names =
      ScanSession
      |> select([session], session.name)
      |> Repo.all()
      |> MapSet.new()

    if MapSet.member?(existing_names, base_name) do
      suffix =
        Stream.iterate(2, &(&1 + 1))
        |> Enum.find(fn suffix ->
          not MapSet.member?(existing_names, "#{base_name} (#{suffix})")
        end)

      "#{base_name} (#{suffix})"
    else
      base_name
    end
  end

  def create_scan_session(attrs) when is_map(attrs) do
    %ScanSession{}
    |> ScanSession.changeset(attrs)
    |> Repo.insert()
  end

  def create_scan_item(%ScanSession{} = scan_session, attrs \\ %{}) when is_map(attrs) do
    attrs =
      attrs
      |> Map.new(fn {key, value} -> {to_string(key), value} end)
      |> Map.put_new("scan_session_id", scan_session.id)
      |> Map.put_new("condition", scan_session.default_condition)
      |> Map.put_new("language", scan_session.default_language)
      |> Map.put_new("finish", scan_session.default_finish)
      |> Map.put_new("location_id", scan_session.default_location_id)

    %ScanItem{}
    |> ScanItem.changeset(attrs)
    |> Repo.insert()
  end

  def create_scan_item_from_capture(%ScanSession{} = scan_session, image_data, _opts \\ [])
      when is_binary(image_data) do
    with {:ok, extension, binary} <- decode_capture_image(image_data),
         {:ok, path} <- write_capture_image(scan_session, extension, binary) do
      create_scan_item(scan_session, %{"image_path" => path, "status" => "processing"})
    end
  end

  def create_recognized_scan_item_from_capture(
        %ScanSession{} = scan_session,
        image_data,
        opts \\ []
      )
      when is_binary(image_data) and is_list(opts) do
    started_at = System.monotonic_time(:microsecond)

    with {:ok, extension, binary} <- decode_capture_image(image_data),
         {:ok, path} <- write_capture_image(scan_session, extension, binary),
         {:ok, recognition} <- recognize_capture_image(path, opts),
         {:ok, scan_item} <- persist_recognized_capture(scan_session, path, recognition) do
      log_capture_timing(started_at, recognition)
      {:ok, scan_item}
    else
      {:error, reason, path} ->
        File.rm(path)
        {:error, reason}

      {:error, reason} ->
        {:error, reason}
    end
  end

  def recognize_scan_item(%ScanItem{} = scan_item, opts \\ []) when is_list(opts) do
    with {:ok, recognition} <- ScanRecognition.recognize(scan_item, opts) do
      persist_recognition(scan_item, recognition)
    else
      {:error, reason} -> mark_scan_item_needs_review(scan_item, %{ocr_error: reason})
    end
  end

  def get_scan_item!(id) do
    ScanItem
    |> Repo.get!(id)
    |> Repo.preload(scan_item_preloads())
  end

  def update_scan_item_review(%ScanItem{} = scan_item, attrs) when is_map(attrs) do
    attrs =
      attrs
      |> Map.new(fn {key, value} -> {to_string(key), value} end)
      |> Map.take(["quantity", "condition", "language", "finish", "location_id"])
      |> normalize_blank_location()

    scan_item
    |> ScanItem.changeset(attrs)
    |> Repo.update()
  end

  def set_scan_item_printing(scan_item_id, scryfall_id)
      when is_binary(scryfall_id) do
    Repo.transaction(fn ->
      scan_item = get_scan_item!(scan_item_id)
      printing = Repo.get!(Printing, scryfall_id)

      {:ok, updated_item} =
        scan_item
        |> ScanItem.changeset(%{
          "accepted_printing_id" => printing.scryfall_id,
          "status" => "recognized"
        })
        |> Repo.update()

      Repo.preload(updated_item, scan_item_preloads(), force: true)
    end)
  end

  def accept_scan_item(scan_item_id) do
    scan_item = get_scan_item!(scan_item_id)

    case scan_item.accepted_printing_id do
      nil -> {:error, :missing_printing}
      scryfall_id -> accept_scan_item_printing(scan_item.id, scryfall_id)
    end
  end

  def accept_scan_item_printing(scan_item_id, scryfall_id) when is_binary(scryfall_id) do
    Repo.transaction(fn ->
      scan_item = get_scan_item!(scan_item_id)

      if scan_item.status == "accepted" do
        Repo.rollback(:already_accepted)
      end

      printing = Repo.get!(Printing, scryfall_id)

      collection_attrs = %{
        "scryfall_id" => printing.scryfall_id,
        "quantity" => scan_item.quantity,
        "condition" => scan_item.condition,
        "language" => scan_item.language,
        "finish" => scan_item.finish,
        "location_id" => scan_item.location_id
      }

      case create_collection_item(collection_attrs) do
        {:ok, collection_item} ->
          {:ok, accepted_item} =
            scan_item
            |> ScanItem.changeset(%{
              "status" => "accepted",
              "accepted_printing_id" => printing.scryfall_id
            })
            |> Repo.update()

          %{
            scan_item: Repo.preload(accepted_item, scan_item_preloads()),
            collection_item: collection_item
          }

        {:error, changeset} ->
          Repo.rollback(changeset)
      end
    end)
  end

  def move_scan_session_items(%ScanSession{} = scan_session, location_id) do
    with {:ok, normalized_location_id} <- normalize_move_location_id(location_id) do
      scan_session = Repo.preload(scan_session, scan_session_preloads(), force: true)

      Repo.transaction(fn ->
        scan_session.scan_items
        |> Enum.reduce(%{moved: 0, skipped: 0}, fn
          %{status: "accepted"}, counts ->
            update_in(counts.skipped, &(&1 + 1))

          scan_item, counts ->
            with {:ok, printing_id} <- scan_item_printing_id(scan_item),
                 {:ok, _collection_item} <-
                   create_collection_item(%{
                     "scryfall_id" => printing_id,
                     "quantity" => scan_item.quantity,
                     "condition" => scan_item.condition,
                     "language" => scan_item.language,
                     "finish" => scan_item.finish,
                     "location_id" => normalized_location_id
                   }),
                 {:ok, _scan_item} <-
                   scan_item
                   |> ScanItem.changeset(%{
                     "status" => "accepted",
                     "accepted_printing_id" => printing_id,
                     "location_id" => normalized_location_id
                   })
                   |> Repo.update() do
              update_in(counts.moved, &(&1 + 1))
            else
              {:error, %Ecto.Changeset{} = changeset} -> Repo.rollback(changeset)
              {:error, :missing_printing} -> update_in(counts.skipped, &(&1 + 1))
            end
        end)
      end)
    end
  end

  def reject_scan_item(scan_item_id) do
    scan_item = get_scan_item!(scan_item_id)

    scan_item
    |> ScanItem.changeset(%{"status" => "rejected"})
    |> Repo.update()
  end

  def undo_scan_item_accept(scan_item_id) do
    Repo.transaction(fn ->
      scan_item = get_scan_item!(scan_item_id)

      unless scan_item.status == "accepted" do
        Repo.rollback(:not_accepted)
      end

      delete_matching_collection_item(scan_item)

      {:ok, reverted_item} =
        scan_item
        |> ScanItem.changeset(%{"status" => "recognized"})
        |> Repo.update()

      Repo.preload(reverted_item, scan_item_preloads(), force: true)
    end)
  end

  def scan_session_items_by_review_state(%ScanSession{} = scan_session) do
    items = scan_session.scan_items || []

    %{
      pending: Enum.filter(items, &(&1.status in ["pending", "processing", "recognized"])),
      reviewed: Enum.filter(items, &(&1.status in ["needs_review", "rejected", "failed"])),
      accepted: Enum.filter(items, &(&1.status == "accepted"))
    }
  end

  defp deck_card_collection_candidates(%DeckCard{} = deck_card) do
    preferred_printing_id = deck_card.preferred_printing_id
    oracle_id = deck_card.oracle_id
    finish = deck_card.finish

    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:inner, [_item, printing], card in assoc(printing, :card))
    |> where([item, printing, _card], printing.oracle_id == ^oracle_id and item.finish == ^finish)
    |> preload([_item, printing, card], printing: {printing, card: card})
    |> order_by([item, printing, card],
      desc: fragment("? = ?", item.scryfall_id, ^preferred_printing_id),
      asc: card.name,
      asc: printing.set_code,
      asc: printing.collector_number,
      asc: item.id
    )
    |> Repo.all()
  end

  defp buylist_printing(%DeckCard{} = deck_card, :exact) do
    cond do
      printing_supports_finish?(deck_card.preferred_printing, deck_card.finish) ->
        deck_card.preferred_printing

      true ->
        buylist_printing(deck_card, :cheapest)
    end
  end

  defp buylist_printing(%DeckCard{}, :none), do: nil
  defp buylist_printing(%DeckCard{}, "none"), do: nil

  defp buylist_printing(%DeckCard{} = deck_card, "exact"), do: buylist_printing(deck_card, :exact)

  defp buylist_printing(%DeckCard{} = deck_card, "cheapest"),
    do: buylist_printing(deck_card, :cheapest)

  defp buylist_printing(%DeckCard{} = deck_card, _mode) do
    deck_card.card.printings
    |> Enum.filter(&printing_supports_finish?(&1, deck_card.finish))
    |> Enum.sort_by(fn printing ->
      {Price.price_cents_for_printing(printing, deck_card.finish) || 999_999_999,
       printing.released_at || ~D[9999-12-31], printing.set_code || "",
       printing.collector_number || ""}
    end)
    |> List.first()
  end

  defp printing_supports_finish?(%Printing{finishes: finishes}, finish) when is_binary(finish) do
    finishes
    |> decode_json([])
    |> Enum.member?(finish)
  end

  defp printing_supports_finish?(_printing, _finish), do: false

  defp buylist_reason(missing, unavailable) when missing > 0 and unavailable > 0,
    do: "missing and owned but unavailable"

  defp buylist_reason(missing, _unavailable) when missing > 0, do: "missing"
  defp buylist_reason(_missing, unavailable) when unavailable > 0, do: "owned but unavailable"
  defp buylist_reason(_missing, _unavailable), do: "available"

  defp price_total_cents(nil, _quantity), do: nil
  defp price_total_cents(price_cents, quantity), do: price_cents * quantity

  defp csv_row(values) do
    values
    |> Enum.map(&csv_cell/1)
    |> Enum.join(",")
  end

  defp csv_cell(nil), do: ""

  defp csv_cell(value) do
    value = to_string(value)

    if String.contains?(value, [",", "\"", "\n"]) do
      ~s("#{String.replace(value, "\"", "\"\"")}")
    else
      value
    end
  end

  defp current_allocation_counts(deck_card_id) do
    DeckAllocation
    |> where([allocation], allocation.deck_card_id == ^deck_card_id)
    |> group_by([allocation], allocation.collection_item_id)
    |> select([allocation], {allocation.collection_item_id, sum(allocation.quantity)})
    |> Repo.all()
    |> Map.new()
  end

  defp other_reserving_allocation_counts(%DeckCard{} = deck_card) do
    DeckAllocation
    |> join(:inner, [allocation], allocated_card in assoc(allocation, :deck_card))
    |> join(:inner, [_allocation, allocated_card], deck in assoc(allocated_card, :deck))
    |> where(
      [allocation, allocated_card, deck],
      deck.status in ^@reserving_deck_statuses and allocated_card.id != ^deck_card.id and
        allocated_card.oracle_id == ^deck_card.oracle_id and
        allocated_card.finish == ^deck_card.finish
    )
    |> group_by([allocation, _allocated_card, _deck], allocation.collection_item_id)
    |> select(
      [allocation, _allocated_card, _deck],
      {allocation.collection_item_id, sum(allocation.quantity)}
    )
    |> Repo.all()
    |> Map.new()
  end

  defp allocation_missing(%DeckCard{} = deck_card, allocated, available) do
    if is_basic_land?(deck_card) do
      0
    else
      max(deck_card.quantity - allocated - available, 0)
    end
  end

  defp allocation_state(%DeckCard{} = deck_card, allocated, available, owned) do
    cond do
      allocated >= deck_card.quantity -> :allocated
      allocated + available >= deck_card.quantity -> :available
      is_basic_land?(deck_card) -> :basic_land
      allocated > 0 or owned > 0 -> :partial
      true -> :missing
    end
  end

  defp is_basic_land?(%DeckCard{card: %Card{type_line: type_line}}) when is_binary(type_line) do
    String.contains?(type_line, "Basic Land")
  end

  defp is_basic_land?(_deck_card), do: false

  defp validate_collection_item_matches_deck_card(
         %CollectionItem{} = item,
         %DeckCard{} = deck_card
       ) do
    item = Repo.preload(item, :printing)

    cond do
      item.printing.oracle_id != deck_card.oracle_id -> {:error, :allocation_card_mismatch}
      item.finish != deck_card.finish -> {:error, :allocation_finish_mismatch}
      true -> :ok
    end
  end

  defp validate_deck_card_allocation_room(
         %DeckCard{} = deck_card,
         %CollectionItem{} = item,
         quantity
       ) do
    status = deck_card_allocation_status(deck_card)
    candidate = Enum.find(status.candidates, &(&1.item.id == item.id))

    cond do
      is_nil(candidate) ->
        {:error, :allocation_card_mismatch}

      candidate.available < quantity ->
        {:error, :not_enough_available}

      status.allocated + quantity > status.required ->
        {:error, :deck_card_already_allocated}

      true ->
        :ok
    end
  end

  defp move_collection_item_to_deck!(%CollectionItem{} = item, quantity) do
    cond do
      item.quantity == quantity ->
        update_collection_item_or_rollback!(item, %{"location_id" => nil})

      item.quantity > quantity ->
        update_collection_item_or_rollback!(item, %{"quantity" => item.quantity - quantity})
        create_collection_item_or_rollback!(collection_item_clone_attrs(item, quantity, nil))

      true ->
        Repo.rollback(:not_enough_available)
    end
  end

  defp restore_collection_item_from_deck!(
         %CollectionItem{} = item,
         quantity,
         source_location_id
       ) do
    cond do
      item.quantity == quantity ->
        update_collection_item_or_rollback!(item, %{"location_id" => source_location_id})

      item.quantity > quantity ->
        update_collection_item_or_rollback!(item, %{"quantity" => item.quantity - quantity})

        create_collection_item_or_rollback!(
          collection_item_clone_attrs(item, quantity, source_location_id)
        )

      true ->
        Repo.rollback(:allocation_quantity_mismatch)
    end
  end

  defp update_collection_item_or_rollback!(%CollectionItem{} = item, attrs) do
    case update_collection_item(item, attrs) do
      {:ok, item} -> item
      {:error, changeset} -> Repo.rollback(changeset)
    end
  end

  defp create_collection_item_or_rollback!(attrs) do
    case create_collection_item(attrs) do
      {:ok, item} -> item
      {:error, changeset} -> Repo.rollback(changeset)
    end
  end

  defp collection_item_clone_attrs(%CollectionItem{} = item, quantity, location_id) do
    %{
      "scryfall_id" => item.scryfall_id,
      "quantity" => quantity,
      "condition" => item.condition,
      "language" => item.language,
      "finish" => item.finish,
      "location_id" => location_id,
      "notes" => item.notes
    }
  end

  defp bulk_allocate_deck_card_preview(%DeckCard{} = deck_card, mode) do
    status = deck_card_allocation_status(deck_card)
    needed = max(status.required - status.allocated, 0)

    status.candidates
    |> Enum.filter(&bulk_allocation_candidate?(&1, deck_card, mode))
    |> Enum.reduce_while({0, []}, fn candidate, {allocated, entries} ->
      remaining = needed - allocated

      if remaining <= 0 do
        {:halt, {allocated, entries}}
      else
        quantity = min(remaining, candidate.available)

        entry = %{
          deck_card: deck_card,
          item: candidate.item,
          quantity: quantity,
          exact?: candidate.item.scryfall_id == deck_card.preferred_printing_id
        }

        {:cont, {allocated + quantity, entries ++ [entry]}}
      end
    end)
    |> elem(1)
  end

  defp bulk_allocation_candidate?(%{available: available}, _deck_card, _mode)
       when available <= 0,
       do: false

  defp bulk_allocation_candidate?(%{item: item}, %DeckCard{} = deck_card, :exact_printings) do
    is_binary(deck_card.preferred_printing_id) and
      item.scryfall_id == deck_card.preferred_printing_id
  end

  defp bulk_allocation_candidate?(_candidate, _deck_card, :matching_printings), do: true

  defp stringify_keys(attrs) do
    Map.new(attrs, fn {key, value} -> {to_string(key), value} end)
  end

  defp normalize_blank_preferred_printing(%{"preferred_printing_id" => ""} = attrs),
    do: Map.put(attrs, "preferred_printing_id", nil)

  defp normalize_blank_preferred_printing(attrs), do: attrs

  defp resolve_deck_card_identity(%{"oracle_id" => oracle_id} = attrs)
       when is_binary(oracle_id) and oracle_id != "" do
    if Repo.get(Card, oracle_id), do: {:ok, attrs}, else: {:error, :card_not_found}
  end

  defp resolve_deck_card_identity(%{"name" => name} = attrs) when is_binary(name) do
    case find_card_by_name(name) do
      %Card{} = card -> {:ok, Map.put(attrs, "oracle_id", card.oracle_id)}
      nil -> {:error, :card_not_found}
    end
  end

  defp resolve_deck_card_identity(_attrs), do: {:error, :card_not_found}

  defp validate_preferred_printing_identity(
         %{"oracle_id" => oracle_id, "preferred_printing_id" => preferred_printing_id} = attrs
       )
       when is_binary(preferred_printing_id) do
    case Repo.get(Printing, preferred_printing_id) do
      %Printing{oracle_id: ^oracle_id} -> {:ok, attrs}
      %Printing{} -> {:error, :preferred_printing_mismatch}
      nil -> {:error, :preferred_printing_not_found}
    end
  end

  defp validate_preferred_printing_identity(attrs), do: {:ok, attrs}

  defp import_deck_card(deck, entry) do
    case add_card_to_deck(deck, entry) do
      {:error, reason}
      when reason in [:preferred_printing_mismatch, :preferred_printing_not_found] ->
        entry = Map.put(entry, "preferred_printing_id", nil)

        case add_card_to_deck(deck, entry) do
          {:ok, deck_card} -> {:ok, deck_card, :skipped_preferred_printing}
          other -> other
        end

      other ->
        other
    end
  end

  defp upsert_deck_card(attrs) do
    deck_id = attrs["deck_id"]
    oracle_id = attrs["oracle_id"]
    zone = Map.get(attrs, "zone", "mainboard")
    quantity = parse_quantity(Map.get(attrs, "quantity", 1))

    existing =
      Repo.one(
        from deck_card in DeckCard,
          where:
            deck_card.deck_id == ^deck_id and deck_card.oracle_id == ^oracle_id and
              deck_card.zone == ^zone,
          limit: 1
      )

    attrs = Map.put(attrs, "quantity", quantity)

    case existing do
      nil ->
        %DeckCard{}
        |> DeckCard.changeset(attrs)
        |> Repo.insert()

      %DeckCard{} = deck_card ->
        update_attrs =
          attrs
          |> Map.put("quantity", deck_card.quantity + quantity)
          |> Map.take(["quantity", "preferred_printing_id", "zone", "finish"])
          |> Enum.reject(fn {key, value} -> key == "preferred_printing_id" and is_nil(value) end)
          |> Map.new()

        deck_card
        |> DeckCard.changeset(update_attrs)
        |> Repo.update()
    end
  end

  defp find_card_by_name(name) do
    normalized_name = normalize_deck_card_name(name)

    Repo.one(
      from card in Card,
        where: fragment("lower(?) = ?", card.name, ^String.downcase(normalized_name)),
        order_by: [asc: card.name],
        limit: 1
    )
  end

  defp parse_decklist(text) do
    text
    |> String.split(~r/\R/u)
    |> Enum.reduce({[], "mainboard"}, fn line, {entries, zone} ->
      parse_decklist_line(line, zone, entries)
    end)
    |> elem(0)
    |> Enum.reverse()
  end

  defp parse_decklist_line(line, current_zone, entries) do
    line = line |> String.trim() |> strip_decklist_comment()

    cond do
      line == "" ->
        {entries, current_zone}

      zone = decklist_zone_heading(line) ->
        {entries, zone}

      true ->
        case parse_deck_card_line(line, current_zone) do
          nil -> {entries, current_zone}
          entry -> {[entry | entries], current_zone}
        end
    end
  end

  defp parse_deck_card_line("SB:" <> rest, _current_zone),
    do: parse_deck_card_line(String.trim(rest), "sideboard")

  defp parse_deck_card_line(line, current_zone) do
    with [_, quantity, name] <- Regex.run(~r/^\s*(\d+)\s*x?\s+(.+?)\s*$/i, line) do
      {name, preferred_printing_id} = parse_deck_card_name_and_printing(name)

      %{
        "quantity" => quantity,
        "name" => name,
        "zone" => current_zone,
        "finish" => parse_deck_card_finish(line),
        "preferred_printing_id" => preferred_printing_id
      }
    else
      _no_match -> nil
    end
  end

  defp parse_deck_card_name_and_printing(name) do
    cleaned_name = normalize_deck_card_name(name)

    case Regex.run(~r/^(.+?)\s+\(([A-Za-z0-9]+)\)\s+([^\s]+)\s*$/, cleaned_name) do
      [_, card_name, set_code, collector_number] ->
        printing = get_printing(set_code, collector_number)
        {normalize_deck_card_name(card_name), printing && printing.scryfall_id}

      _no_printing ->
        {cleaned_name, nil}
    end
  end

  defp normalize_deck_card_name(name) do
    name
    |> String.trim()
    |> String.replace(~r/\s+\[[^\]]+\]\s*$/u, "")
    |> String.replace(~r/\s+\*[A-Z]+\*\s*$/u, "")
    |> String.trim()
  end

  defp parse_deck_card_finish(line) do
    cond do
      Regex.match?(~r/\*F\*\s*$/i, line) -> "foil"
      Regex.match?(~r/\*E\*\s*$/i, line) -> "etched"
      true -> "nonfoil"
    end
  end

  defp dedupe_decklist_entries(entries) do
    entries
    |> Enum.reduce(%{}, fn entry, deduped ->
      key = decklist_entry_key(entry)
      quantity = parse_quantity(entry["quantity"])

      Map.update(deduped, key, Map.put(entry, "quantity", quantity), fn existing ->
        existing
        |> Map.put("quantity", max(parse_quantity(existing["quantity"]), quantity))
        |> prefer_present_printing(entry)
      end)
    end)
    |> Map.values()
  end

  defp decklist_entry_key(entry) do
    {
      String.downcase(entry["name"] || ""),
      entry["zone"],
      entry["preferred_printing_id"],
      entry["finish"]
    }
  end

  defp prefer_present_printing(existing, %{"preferred_printing_id" => preferred_printing_id})
       when is_binary(preferred_printing_id) do
    Map.put(existing, "preferred_printing_id", preferred_printing_id)
  end

  defp prefer_present_printing(existing, _entry), do: existing

  defp strip_decklist_comment(line) do
    line
    |> String.replace(~r/\s+#.*$/u, "")
    |> String.trim()
  end

  defp decklist_zone_heading(line) do
    case line |> String.downcase() |> String.trim_trailing(":") do
      "main" -> "mainboard"
      "mainboard" -> "mainboard"
      "deck" -> "mainboard"
      "side" -> "sideboard"
      "sideboard" -> "sideboard"
      "commander" -> "commander"
      "commanders" -> "commander"
      "maybe" -> "maybeboard"
      "maybeboard" -> "maybeboard"
      _other -> nil
    end
  end

  defp parse_quantity(quantity) when is_integer(quantity), do: quantity

  defp parse_quantity(quantity) when is_binary(quantity) do
    case Integer.parse(quantity) do
      {parsed, ""} -> parsed
      _invalid -> 1
    end
  end

  defp parse_quantity(_quantity), do: 1

  defp deck_preloads do
    [
      deck_cards:
        {from(deck_card in DeckCard,
           join: card in assoc(deck_card, :card),
           left_join: preferred_printing in assoc(deck_card, :preferred_printing),
           order_by: [
             asc: deck_card.zone,
             asc: card.name,
             asc: deck_card.id
           ],
           preload: [
             card:
               {card,
                printings:
                  ^from(printing in Printing,
                    order_by: [desc: printing.released_at, asc: printing.set_code]
                  )},
             preferred_printing: preferred_printing
           ]
         ), []}
    ]
  end

  defp deck_zone_label("mainboard"), do: "Mainboard"
  defp deck_zone_label("sideboard"), do: "Sideboard"
  defp deck_zone_label("commander"), do: "Commander"
  defp deck_zone_label("maybeboard"), do: "Maybeboard"
  defp deck_zone_label(zone), do: String.capitalize(zone)

  defp count_deck_groups(cards, group_fun) do
    cards
    |> Enum.group_by(group_fun)
    |> Map.new(fn {group, group_cards} ->
      {group, Enum.reduce(group_cards, 0, &(&1.quantity + &2))}
    end)
  end

  defp deck_color_counts(cards) do
    empty = %{"W" => 0, "U" => 0, "B" => 0, "R" => 0, "G" => 0, "C" => 0}

    Enum.reduce(cards, empty, fn deck_card, counts ->
      colors = deck_card.card.color_identity |> decode_json([]) |> List.wrap()

      if colors == [] do
        Map.update!(counts, "C", &(&1 + deck_card.quantity))
      else
        Enum.reduce(colors, counts, fn color, color_counts ->
          Map.update(color_counts, color, deck_card.quantity, &(&1 + deck_card.quantity))
        end)
      end
    end)
  end

  defp deck_card_type(%DeckCard{card: %Card{type_line: type_line}}) when is_binary(type_line) do
    cond do
      String.contains?(type_line, "Creature") -> "Creature"
      String.contains?(type_line, "Land") -> "Land"
      String.contains?(type_line, "Instant") -> "Instant"
      String.contains?(type_line, "Sorcery") -> "Sorcery"
      String.contains?(type_line, "Artifact") -> "Artifact"
      String.contains?(type_line, "Enchantment") -> "Enchantment"
      String.contains?(type_line, "Planeswalker") -> "Planeswalker"
      true -> "Other"
    end
  end

  defp deck_card_type(_deck_card), do: "Other"

  defp log_capture_timing(started_at, recognition) do
    total_us = System.monotonic_time(:microsecond) - started_at
    timings = Map.get(recognition, :timings, %{})

    Logger.debug(fn ->
      "OCR capture timing total=#{format_us(total_us)} ocr=#{format_us(timings[:ocr_us])} parse=#{format_us(timings[:parse_us])} match=#{format_us(timings[:match_us])}"
    end)
  end

  defp format_us(nil), do: "n/a"
  defp format_us(us), do: "#{Float.round(us / 1_000, 1)}ms"

  defp recognize_capture_image(path, opts) do
    case ScanRecognition.recognize(%ScanItem{image_path: path}, opts) do
      {:ok, %{candidates: [_ | _]} = recognition} ->
        {:ok, recognition}

      {:ok, %{candidates: []}} ->
        {:error, "No card match found. Keep the card steady in the frame.", path}

      {:error, reason} ->
        {:error, reason, path}
    end
  end

  defp persist_recognized_capture(%ScanSession{} = scan_session, path, recognition) do
    Repo.transaction(fn ->
      {:ok, scan_item} =
        create_scan_item(scan_session, %{
          "image_path" => path,
          "status" => "processing"
        })

      case persist_recognition(scan_item, recognition) do
        {:ok, scan_item} -> scan_item
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  defp persist_recognition(%ScanItem{} = scan_item, %{candidates: [top | _]}) do
    scan_item
    |> ScanItem.changeset(%{
      "status" => "recognized",
      "accepted_printing_id" => top.printing.scryfall_id
    })
    |> Repo.update()
    |> case do
      {:ok, updated_item} -> {:ok, Repo.preload(updated_item, scan_item_preloads(), force: true)}
      {:error, changeset} -> {:error, changeset}
    end
  end

  defp persist_recognition(%ScanItem{} = scan_item, %{candidates: []}) do
    scan_item
    |> ScanItem.changeset(%{"status" => "needs_review"})
    |> Repo.update()
    |> case do
      {:ok, updated_item} -> {:ok, Repo.preload(updated_item, scan_item_preloads(), force: true)}
      {:error, changeset} -> {:error, changeset}
    end
  end

  defp mark_scan_item_needs_review(%ScanItem{} = scan_item, evidence) when is_map(evidence) do
    case update_scan_item_status(scan_item, "needs_review") do
      {:ok, updated_item} ->
        {:error, Map.get(evidence, :ocr_error, "Recognition failed."),
         Repo.preload(updated_item, scan_item_preloads(), force: true)}

      {:error, reason} ->
        {:error, reason, scan_item}
    end
  end

  defp update_scan_item_status(%ScanItem{} = scan_item, status) do
    scan_item
    |> ScanItem.changeset(%{"status" => status})
    |> Repo.update()
  end

  defp decode_capture_image("data:image/jpeg;base64," <> encoded),
    do: decode_base64_capture("jpg", encoded)

  defp decode_capture_image("data:image/png;base64," <> encoded),
    do: decode_base64_capture("png", encoded)

  defp decode_capture_image(_image_data),
    do: {:error, "Capture must be a JPEG or PNG data URL."}

  defp decode_base64_capture(extension, encoded) do
    case Base.decode64(encoded) do
      {:ok, binary} when byte_size(binary) > 0 -> {:ok, extension, binary}
      {:ok, _empty} -> {:error, "Capture image was empty."}
      :error -> {:error, "Capture image data was invalid."}
    end
  end

  defp write_capture_image(%ScanSession{id: scan_session_id}, extension, binary) do
    directory = Path.join(capture_upload_dir(), "scan_sessions/#{scan_session_id}")

    filename =
      "#{System.system_time(:millisecond)}-#{System.unique_integer([:positive])}.#{extension}"

    path = Path.join(directory, filename)

    with :ok <- File.mkdir_p(directory),
         :ok <- File.write(path, binary) do
      {:ok, path}
    else
      {:error, reason} ->
        {:error, "Capture image could not be saved: #{:file.format_error(reason)}"}
    end
  end

  defp capture_upload_dir do
    Application.get_env(
      :manavault,
      :capture_upload_dir,
      Path.expand("data/uploads/scan-captures")
    )
  end

  defp delete_matching_collection_item(%ScanItem{accepted_printing_id: nil}), do: nil

  defp delete_matching_collection_item(%ScanItem{} = scan_item) do
    CollectionItem
    |> where([item], item.scryfall_id == ^scan_item.accepted_printing_id)
    |> where([item], item.quantity == ^scan_item.quantity)
    |> where([item], item.condition == ^scan_item.condition)
    |> where([item], item.language == ^scan_item.language)
    |> where([item], item.finish == ^scan_item.finish)
    |> maybe_matching_collection_location(scan_item.location_id)
    |> order_by([item], desc: item.inserted_at, desc: item.id)
    |> limit(1)
    |> Repo.one()
    |> case do
      nil -> nil
      collection_item -> Repo.delete!(collection_item)
    end
  end

  defp maybe_matching_collection_location(query, nil),
    do: where(query, [item], is_nil(item.location_id))

  defp maybe_matching_collection_location(query, location_id),
    do: where(query, [item], item.location_id == ^location_id)

  defp normalize_blank_location(%{"location_id" => ""} = attrs),
    do: Map.put(attrs, "location_id", nil)

  defp normalize_blank_location(attrs), do: attrs

  defp normalize_move_location_id(nil), do: {:ok, nil}
  defp normalize_move_location_id(""), do: {:ok, nil}

  defp normalize_move_location_id(location_id) when is_integer(location_id) do
    if Repo.get(Location, location_id),
      do: {:ok, location_id},
      else: {:error, :location_not_found}
  end

  defp normalize_move_location_id(location_id) when is_binary(location_id) do
    case Integer.parse(location_id) do
      {id, ""} -> normalize_move_location_id(id)
      _invalid -> {:error, :location_not_found}
    end
  end

  defp scan_item_printing_id(%ScanItem{accepted_printing_id: printing_id})
       when is_binary(printing_id),
       do: {:ok, printing_id}

  defp scan_item_printing_id(_scan_item), do: {:error, :missing_printing}

  defp scan_session_preloads do
    [
      :default_location,
      scan_items: {from(item in ScanItem, order_by: [asc: item.id]), scan_item_preloads()}
    ]
  end

  defp scan_item_preloads do
    [
      :location,
      accepted_printing: :card
    ]
  end

  defp list_printings_for_oracle_id(oracle_id) do
    Printing
    |> where([printing], printing.oracle_id == ^oracle_id)
    |> order_by([printing],
      desc: printing.released_at,
      asc: printing.set_code,
      asc: printing.collector_number
    )
    |> Repo.all()
    |> Repo.preload(:card)
  end

  defp switch_collection_attrs(%CollectionItem{} = collection_item, scryfall_id) do
    case get_printing_by_scryfall_id(scryfall_id) do
      nil ->
        %{
          "scryfall_id" => scryfall_id,
          "language" => collection_item.language,
          "finish" => collection_item.finish
        }

      %Printing{} = printing ->
        %{
          "scryfall_id" => scryfall_id,
          "language" => printing.lang || collection_item.language || "en",
          "finish" => preferred_finish(printing, collection_item.finish)
        }
    end
  end

  defp default_collection_attrs(%Printing{} = printing) do
    %{
      scryfall_id: printing.scryfall_id,
      language: printing.lang || "en",
      finish: first_finish(printing.finishes),
      quantity: 1,
      condition: "near_mint"
    }
  end

  defp first_finish(finishes) do
    finishes
    |> decode_json([])
    |> List.wrap()
    |> Enum.find("nonfoil", &is_binary/1)
  end

  defp preferred_finish(%Printing{finishes: finishes}, current_finish) do
    available_finishes = finishes |> decode_json([]) |> List.wrap()

    cond do
      is_binary(current_finish) and current_finish in available_finishes -> current_finish
      true -> Enum.find(available_finishes, "nonfoil", &is_binary/1)
    end
  end

  defp validate_collection_finish_available(changeset) do
    scryfall_id = Ecto.Changeset.get_field(changeset, :scryfall_id)
    finish = Ecto.Changeset.get_field(changeset, :finish)

    with true <- changeset.valid?,
         true <- is_binary(scryfall_id),
         true <- is_binary(finish),
         %Printing{} = printing <- Repo.get(Printing, scryfall_id),
         finishes <- printing.finishes |> decode_json([]) |> List.wrap(),
         false <- finish in finishes do
      Ecto.Changeset.add_error(changeset, :finish, "is not available for this printing")
    else
      _other -> changeset
    end
  end

  def latest_sync do
    Repo.one(from sync in Sync, order_by: [desc: sync.started_at], limit: 1)
  end

  def sync_scryfall(opts \\ []) do
    fetcher = Keyword.get(opts, :fetcher, &fetch_url/1)
    bulk_url = Keyword.get(opts, :bulk_url, @bulk_metadata_url)
    now = utc_now()

    {:ok, sync} =
      %Sync{}
      |> Sync.changeset(%{status: "running", bulk_type: @bulk_type, started_at: now})
      |> Repo.insert()

    with {:ok, metadata_body} <- fetcher.(bulk_url),
         {:ok, metadata} <- Jason.decode(metadata_body),
         {:ok, download_uri} <- fetch_download_uri(metadata),
         {:ok, bulk_body} <- fetcher.(download_uri),
         {:ok, cards} <- Jason.decode(bulk_body),
         {:ok, counts} <- import_cards(cards, download_uri) do
      sync
      |> Sync.changeset(%{
        status: "succeeded",
        bulk_uri: download_uri,
        completed_at: utc_now(),
        cards_count: counts.cards_count,
        printings_count: counts.printings_count,
        error: nil
      })
      |> Repo.update()
    else
      {:error, reason} -> {:error, fail_sync!(sync, reason)}
      other -> {:error, fail_sync!(sync, inspect(other))}
    end
  end

  def import_cards(cards, bulk_uri \\ nil) when is_list(cards) do
    now = utc_now()

    result =
      Repo.transaction(
        fn ->
          rows = Enum.flat_map(cards, &card_row(&1, now))
          printing_rows = Enum.flat_map(cards, &printing_row(&1, now))
          search_rows = Enum.flat_map(cards, &printing_search_row/1)

          insert_in_batches(Card, rows,
            conflict_target: [:oracle_id],
            on_conflict:
              {:replace,
               [
                 :name,
                 :type_line,
                 :oracle_text,
                 :mana_cost,
                 :cmc,
                 :colors,
                 :color_identity,
                 :legalities,
                 :updated_at
               ]}
          )

          insert_in_batches(Printing, printing_rows,
            conflict_target: [:scryfall_id],
            on_conflict:
              {:replace,
               [
                 :oracle_id,
                 :set_code,
                 :set_name,
                 :collector_number,
                 :lang,
                 :rarity,
                 :finishes,
                 :image_uris,
                 :prices,
                 :released_at,
                 :updated_at
               ]}
          )

          refresh_printing_search_rows(search_rows)

          %{cards_count: length(rows), printings_count: length(printing_rows), bulk_uri: bulk_uri}
        end,
        timeout: :infinity
      )

    if match?({:ok, _counts}, result), do: clear_card_name_suggestion_cache()

    result
  end

  defp normalize_filter(value) when is_binary(value), do: String.trim(value)
  defp normalize_filter(_value), do: ""

  defp card_name_suggestion_candidates(term, candidate_limit) do
    cache = cached_card_names()

    cache
    |> candidate_pool(term)
    |> Enum.filter(&card_name_candidate?(term, &1))
    |> Enum.take(candidate_limit)
  end

  defp cached_card_names do
    case :persistent_term.get(@card_name_cache_key, nil) do
      nil ->
        entries =
          Card
          |> select([card], card.name)
          |> order_by([card], asc: card.name)
          |> Repo.all()
          |> Enum.uniq()
          |> Enum.map(&card_name_cache_entry/1)

        cache = %{
          entries: entries,
          by_initial: index_card_names_by_initial(entries),
          by_ngram: index_card_names_by_ngram(entries)
        }

        :persistent_term.put(@card_name_cache_key, cache)
        cache

      %{by_initial: _by_initial, by_ngram: _by_ngram} = cache ->
        cache

      _stale_cache ->
        clear_card_name_suggestion_cache()
        cached_card_names()
    end
  end

  defp clear_card_name_suggestion_cache do
    try do
      :persistent_term.erase(@card_name_cache_key)
    rescue
      ArgumentError -> :ok
    end
  end

  defp card_name_cache_entry(name) do
    normalized_name = normalize_card_suggestion(name)

    %{
      name: name,
      normalized_name: normalized_name,
      compact_name: String.replace(normalized_name, " ", ""),
      tokens: String.split(normalized_name, " ", trim: true)
    }
  end

  defp index_card_names_by_initial(entries) do
    Enum.reduce(entries, %{}, fn entry, index ->
      entry.tokens
      |> Enum.flat_map(&token_initial/1)
      |> Enum.uniq()
      |> Enum.reduce(index, fn initial, index ->
        Map.update(index, initial, [entry], &[entry | &1])
      end)
    end)
  end

  defp index_card_names_by_ngram(entries) do
    Enum.reduce(entries, %{}, fn entry, index ->
      entry.compact_name
      |> name_ngrams()
      |> Enum.reduce(index, fn ngram, index ->
        Map.update(index, ngram, [entry], &[entry | &1])
      end)
    end)
  end

  defp candidate_pool(%{by_initial: by_initial}, term) when byte_size(term) < 3 do
    term
    |> String.split(" ", trim: true)
    |> Enum.flat_map(&token_initial/1)
    |> Enum.flat_map(&Map.get(by_initial, &1, []))
    |> uniq_card_name_entries()
  end

  defp candidate_pool(%{by_ngram: by_ngram}, term) do
    compact_term = String.replace(term, " ", "")

    compact_term
    |> name_ngrams()
    |> Enum.flat_map(&Map.get(by_ngram, &1, []))
    |> uniq_card_name_entries()
  end

  defp name_ngrams(value) do
    graphemes = String.graphemes(value)

    cond do
      length(graphemes) >= 3 ->
        graphemes
        |> Enum.chunk_every(3, 1, :discard)
        |> Enum.map(&Enum.join/1)
        |> Enum.uniq()

      value == "" ->
        []

      true ->
        [value]
    end
  end

  defp uniq_card_name_entries(entries) do
    entries
    |> Enum.uniq_by(& &1.name)
    |> Enum.sort_by(&String.downcase(&1.name))
  end

  defp normalize_card_suggestion(value) do
    value
    |> String.downcase()
    |> String.replace(~r/[^[:alnum:]]+/u, " ")
    |> String.trim()
  end

  defp card_name_match_score(term, name) do
    normalized_name = normalize_card_suggestion(name)

    contains_score =
      cond do
        normalized_name == term -> 0
        String.starts_with?(normalized_name, term) -> 1
        String.contains?(normalized_name, term) -> 2
        true -> 8
      end

    token_distance =
      normalized_name
      |> String.split(" ", trim: true)
      |> Enum.map(&edit_distance(term, &1))
      |> Enum.min(fn -> edit_distance(term, normalized_name) end)

    full_distance = edit_distance(term, normalized_name)
    contains_score * 100 + min(full_distance, token_distance + 2)
  end

  defp card_name_candidate?(term, %{
         normalized_name: normalized_name,
         compact_name: compact_name,
         tokens: name_tokens
       }) do
    compact_term = String.replace(term, " ", "")
    term_tokens = String.split(term, " ", trim: true)

    exact_or_substring? =
      normalized_name == term or
        String.starts_with?(normalized_name, term) or
        String.contains?(normalized_name, term) or
        String.starts_with?(compact_name, compact_term) or
        String.contains?(compact_name, compact_term) or
        token_prefix_match?(term_tokens, name_tokens)

    exact_or_substring? or fuzzy_candidate?(term, term_tokens, normalized_name, name_tokens)
  end

  defp fuzzy_candidate?(term, term_tokens, normalized_name, name_tokens) do
    String.length(term) >= 4 and
      abs(String.length(term) - String.length(normalized_name)) <= 8 and
      token_initial_match?(term_tokens, name_tokens) and
      card_name_distance_match?(term, normalized_name)
  end

  defp card_name_distance_match?(term, normalized_name) do
    distance_threshold = max(3, div(String.length(term), 4))
    distances = card_name_distances(term, normalized_name)

    Enum.min(distances) <= distance_threshold
  end

  defp token_prefix_match?(term_tokens, name_tokens) do
    Enum.any?(term_tokens, fn term_token ->
      Enum.any?(name_tokens, &String.starts_with?(&1, term_token))
    end)
  end

  defp token_initial_match?(term_tokens, name_tokens) do
    term_initials = Enum.flat_map(term_tokens, &token_initial/1)
    name_initials = Enum.flat_map(name_tokens, &token_initial/1)

    Enum.any?(term_initials, &(&1 in name_initials))
  end

  defp token_initial(token) do
    case String.graphemes(token) do
      [initial | _rest] -> [initial]
      [] -> []
    end
  end

  defp card_name_distances(term, normalized_name) do
    token_distances =
      normalized_name
      |> String.split(" ", trim: true)
      |> Enum.map(&edit_distance(term, &1))

    [edit_distance(term, normalized_name) | token_distances]
  end

  defp edit_distance(left, right) when left == right, do: 0
  defp edit_distance("", right), do: String.length(right)
  defp edit_distance(left, ""), do: String.length(left)

  defp edit_distance(left, right) do
    right_chars = String.graphemes(right)
    initial_row = Enum.to_list(0..length(right_chars))

    left
    |> String.graphemes()
    |> Enum.with_index(1)
    |> Enum.reduce(initial_row, fn {left_char, row_index}, previous_row ->
      {row, _left_value} =
        right_chars
        |> Enum.with_index(1)
        |> Enum.reduce({[row_index], row_index}, fn {right_char, column_index},
                                                    {row, left_value} ->
          insert_cost = left_value + 1
          delete_cost = Enum.at(previous_row, column_index) + 1

          replace_cost =
            Enum.at(previous_row, column_index - 1) +
              if(left_char == right_char, do: 0, else: 1)

          value = min(insert_cost, min(delete_cost, replace_cost))

          {row ++ [value], value}
        end)

      row
    end)
    |> List.last()
  end

  defp maybe_filter_card_name(query, ""), do: query

  defp maybe_filter_card_name(query, name) do
    pattern = "%#{String.downcase(name)}%"
    where(query, [_printing, card], fragment("lower(?) LIKE ?", card.name, ^pattern))
  end

  defp maybe_filter_set_code(query, ""), do: query

  defp maybe_filter_set_code(query, set_code) do
    where(query, [printing, _card], printing.set_code == ^set_code)
  end

  defp maybe_filter_collector_number(query, ""), do: query

  defp maybe_filter_collector_number(query, collector_number) do
    where(query, [printing, _card], printing.collector_number == ^collector_number)
  end

  defp maybe_filter_collection_search(query, ""), do: query

  defp maybe_filter_collection_search(query, search) do
    pattern = "%#{String.downcase(search)}%"

    where(
      query,
      [_item, printing, card, ...],
      fragment("lower(?) LIKE ?", card.name, ^pattern) or
        fragment("lower(?) LIKE ?", printing.set_code, ^pattern) or
        fragment("lower(?) LIKE ?", printing.collector_number, ^pattern) or
        fragment("lower(?) LIKE ?", printing.scryfall_id, ^pattern)
    )
  end

  defp maybe_filter_collection_condition(query, ""), do: query

  defp maybe_filter_collection_condition(query, condition) do
    where(query, [item, _printing, _card, _location], item.condition == ^condition)
  end

  defp maybe_filter_collection_language(query, ""), do: query

  defp maybe_filter_collection_language(query, language) do
    where(query, [item, _printing, _card, _location], item.language == ^language)
  end

  defp maybe_filter_collection_finish(query, ""), do: query

  defp maybe_filter_collection_finish(query, finish) do
    where(query, [item, _printing, _card, _location], item.finish == ^finish)
  end

  defp maybe_filter_collection_location(query, ""), do: query

  defp maybe_filter_collection_location(query, "unfiled") do
    where(query, [item, _printing, _card, _location], is_nil(item.location_id))
  end

  defp maybe_filter_collection_location(query, location_id) do
    case Integer.parse(location_id) do
      {id, ""} -> where(query, [item, _printing, _card, _location], item.location_id == ^id)
      _invalid -> where(query, false)
    end
  end

  defp insert_in_batches(_schema, [], _opts), do: :ok

  defp insert_in_batches(schema, rows, opts) do
    rows
    |> Enum.chunk_every(@batch_size)
    |> Enum.each(fn batch -> Repo.insert_all(schema, batch, opts) end)
  end

  defp refresh_printing_search_rows([]), do: :ok

  defp refresh_printing_search_rows(rows) do
    rows
    |> Enum.map(& &1.scryfall_id)
    |> Enum.chunk_every(@batch_size)
    |> Enum.each(fn ids ->
      placeholders = Enum.map_join(ids, ",", fn _ -> "?" end)

      Repo.query!(
        "DELETE FROM scryfall_printing_search WHERE scryfall_id IN (#{placeholders})",
        ids
      )
    end)

    rows
    |> Enum.chunk_every(@batch_size)
    |> Enum.each(fn batch ->
      values = Enum.map_join(batch, ",", fn _ -> "(?, ?, ?, ?, ?, ?, ?, ?)" end)

      params =
        Enum.flat_map(batch, fn row ->
          [
            row.scryfall_id,
            row.name,
            row.compact_name,
            row.type_line,
            row.oracle_text,
            row.compact_oracle_text,
            row.set_code,
            row.collector_number
          ]
        end)

      Repo.query!(
        """
        INSERT INTO scryfall_printing_search (
          scryfall_id,
          name,
          compact_name,
          type_line,
          oracle_text,
          compact_oracle_text,
          set_code,
          collector_number
        )
        VALUES #{values}
        """,
        params
      )
    end)
  end

  defp card_row(%{"oracle_id" => oracle_id, "name" => name} = card, now)
       when is_binary(oracle_id) and is_binary(name) do
    [
      %{
        oracle_id: oracle_id,
        name: name,
        type_line: card["type_line"],
        oracle_text: oracle_text(card),
        mana_cost: card["mana_cost"],
        cmc: card["cmc"],
        colors: encode_json(card["colors"] || []),
        color_identity: encode_json(card["color_identity"] || []),
        legalities: encode_json(card["legalities"] || %{}),
        inserted_at: now,
        updated_at: now
      }
    ]
  end

  defp card_row(_card, _now), do: []

  defp printing_row(%{"id" => scryfall_id, "oracle_id" => oracle_id} = card, now)
       when is_binary(scryfall_id) and is_binary(oracle_id) do
    [
      %{
        scryfall_id: scryfall_id,
        oracle_id: oracle_id,
        set_code: String.downcase(card["set"] || ""),
        set_name: card["set_name"],
        collector_number: card["collector_number"] || "",
        lang: card["lang"] || "en",
        rarity: card["rarity"],
        finishes: encode_json(card["finishes"] || []),
        image_uris: encode_json(image_uris(card)),
        prices: encode_json(card["prices"] || %{}),
        released_at: parse_date(card["released_at"]),
        inserted_at: now,
        updated_at: now
      }
    ]
  end

  defp printing_row(_card, _now), do: []

  defp printing_search_row(%{"id" => scryfall_id, "name" => name} = card)
       when is_binary(scryfall_id) and is_binary(name) do
    oracle_text = oracle_text(card) || ""

    [
      %{
        scryfall_id: scryfall_id,
        name: normalize_search_text(name),
        compact_name: compact_search_text(name),
        type_line: normalize_search_text(card["type_line"] || ""),
        oracle_text: normalize_search_text(oracle_text),
        compact_oracle_text: compact_search_text(oracle_text),
        set_code: normalize_search_text(card["set"] || ""),
        collector_number: normalize_search_text(card["collector_number"] || "")
      }
    ]
  end

  defp printing_search_row(_card), do: []

  defp normalize_search_text(value) when is_binary(value) do
    value
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9]+/u, " ")
    |> String.trim()
  end

  defp compact_search_text(value) when is_binary(value) do
    value
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9]+/u, "")
  end

  defp oracle_text(%{"oracle_text" => text}) when is_binary(text), do: text

  defp oracle_text(%{"card_faces" => faces}) when is_list(faces) do
    faces
    |> Enum.map(&Map.get(&1, "oracle_text"))
    |> Enum.reject(&is_nil/1)
    |> Enum.join("\n---\n")
  end

  defp oracle_text(_card), do: nil

  defp image_uris(%{"image_uris" => image_uris}) when is_map(image_uris), do: image_uris

  defp image_uris(%{"card_faces" => faces}) when is_list(faces) do
    faces
    |> Enum.map(&Map.get(&1, "image_uris"))
    |> Enum.reject(&is_nil/1)
  end

  defp image_uris(_card), do: %{}

  defp encode_json(value), do: Jason.encode!(value)

  defp decode_json(value, fallback) when is_binary(value) do
    case Jason.decode(value) do
      {:ok, decoded} -> decoded
      {:error, _reason} -> fallback
    end
  end

  defp decode_json(_value, fallback), do: fallback

  defp parse_date(nil), do: nil

  defp parse_date(date) when is_binary(date) do
    case Date.from_iso8601(date) do
      {:ok, parsed} -> parsed
      {:error, _reason} -> nil
    end
  end

  defp fetch_download_uri(%{"download_uri" => download_uri}) when is_binary(download_uri) do
    {:ok, download_uri}
  end

  defp fetch_download_uri(_metadata),
    do: {:error, "Scryfall bulk metadata did not include download_uri"}

  defp fail_sync!(sync, reason) do
    sync
    |> Sync.changeset(%{
      status: "failed",
      completed_at: utc_now(),
      error: format_error(reason)
    })
    |> Repo.update!()
  end

  defp format_error(%{__exception__: true} = exception), do: Exception.message(exception)
  defp format_error(reason) when is_binary(reason), do: reason
  defp format_error(reason), do: inspect(reason)

  defp fetch_url(url) do
    case Req.get(url,
           headers: [
             {"accept", "application/json"},
             {"user-agent", "ManaVault/0.1 (+https://github.com/cfbender/manavault)"}
           ]
         ) do
      {:ok, %{status: status, body: body}} when status in 200..299 -> {:ok, normalize_body(body)}
      {:ok, %{status: status}} -> {:error, "Scryfall request failed with HTTP #{status}"}
      {:error, reason} -> {:error, reason}
    end
  end

  defp normalize_body(body) when is_binary(body), do: body
  defp normalize_body(body), do: Jason.encode!(body)

  defp utc_now do
    DateTime.utc_now() |> DateTime.truncate(:second)
  end
end
