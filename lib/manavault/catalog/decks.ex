defmodule Manavault.Catalog.Decks do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{
    Card,
    Collection,
    CollectionItem,
    CSV,
    Deck,
    DeckAllocation,
    DeckCard,
    Decklists,
    DeckSummaries,
    EDHRec,
    Finishes,
    Location,
    Price,
    Printing,
    Util
  }

  alias Manavault.Repo

  @reserving_deck_statuses ["active"]
  @share_token_bytes 18
  @share_token_attempts 5

  def list_decks do
    Deck
    |> order_by([deck], asc: deck.name, asc: deck.id)
    |> Repo.all()
  end

  def list_deck_summaries do
    list_decks()
    |> DeckSummaries.put_fields()
  end

  def count_decks do
    Repo.aggregate(Deck, :count)
  end

  def get_deck_by_share_token(nil), do: nil

  def get_deck_by_share_token(token) when is_binary(token) do
    token = String.trim(token)

    if token == "" do
      nil
    else
      Deck
      |> Repo.get_by(share_token: token)
      |> case do
        nil -> nil
        deck -> Repo.preload(deck, deck_preloads())
      end
    end
  end

  def get_deck!(id) do
    Deck
    |> Repo.get!(id)
    |> Repo.preload(deck_preloads())
  end

  def deck_cards(%Deck{deck_cards: cards}) when is_list(cards), do: cards

  def deck_cards(%Deck{} = deck) do
    deck
    |> Repo.preload(deck_preloads())
    |> Map.fetch!(:deck_cards)
  end

  def deck_card_count(%Deck{card_count: count}) when is_integer(count), do: count

  def deck_card_count(%Deck{deck_cards: cards}) when is_list(cards) do
    cards
    |> Enum.filter(&DeckCard.counts_toward_deck_total?/1)
    |> Enum.reduce(0, &(&1.quantity + &2))
  end

  def deck_card_count(%Deck{id: id}) do
    count =
      DeckCard
      |> where(
        [deck_card],
        deck_card.deck_id == ^id and deck_card.zone in ^DeckCard.deck_count_zones()
      )
      |> Repo.aggregate(:sum, :quantity)

    count || 0
  end

  def deck_unique_card_count(%Deck{unique_card_count: count}) when is_integer(count), do: count

  def deck_unique_card_count(%Deck{deck_cards: cards}) when is_list(cards) do
    cards
    |> Enum.filter(&DeckCard.counts_toward_deck_total?/1)
    |> length()
  end

  def deck_unique_card_count(%Deck{id: id}) do
    DeckCard
    |> where(
      [deck_card],
      deck_card.deck_id == ^id and deck_card.zone in ^DeckCard.deck_count_zones()
    )
    |> Repo.aggregate(:count, :id)
  end

  def deck_commander_color_identity(%Deck{commander_color_identity: colors}) when is_list(colors),
    do: colors

  def deck_commander_color_identity(%Deck{deck_cards: cards}) when is_list(cards) do
    cards
    |> Enum.filter(&(&1.zone == "commander"))
    |> DeckSummaries.commander_color_identity_from_cards()
  end

  def deck_commander_color_identity(%Deck{id: id}) do
    id
    |> DeckSummaries.display()
    |> Map.fetch!(:commander_color_identity)
  end

  def deck_cover_image_url(%Deck{cover_image_url: url}) when is_binary(url), do: url

  def deck_cover_image_url(%Deck{deck_cards: cards}) when is_list(cards) do
    DeckSummaries.cover_image_url_from_cards(cards)
  end

  def deck_cover_image_url(%Deck{id: id}) do
    id
    |> DeckSummaries.display()
    |> Map.fetch!(:cover_image_url)
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

  def ensure_deck_share_token(%Deck{} = deck) do
    deck = Repo.get!(Deck, deck.id)

    case deck.share_token do
      token when is_binary(token) and token != "" ->
        {:ok, Repo.preload(deck, deck_preloads())}

      _token ->
        put_deck_share_token(deck, @share_token_attempts)
    end
  end

  def delete_deck(%Deck{} = deck) do
    Repo.transaction(fn ->
      deck =
        deck
        |> Repo.preload(deck_cards: [deck_allocations: [:collection_item]])

      Enum.each(deck.deck_cards, fn deck_card ->
        case delete_deck_card(deck_card) do
          {:ok, _deck_card} -> :ok
          {:error, reason} -> Repo.rollback(reason)
        end
      end)

      case Repo.delete(deck) do
        {:ok, deck} -> deck
        {:error, changeset} -> Repo.rollback(changeset)
      end
    end)
  end

  def deck_reserves_cards?(%Deck{status: status}), do: deck_reserves_cards?(status)
  def deck_reserves_cards?(status) when is_binary(status), do: status in @reserving_deck_statuses

  defp put_deck_share_token(_deck, 0), do: {:error, :share_token_collision}

  defp put_deck_share_token(%Deck{} = deck, attempts) do
    case deck |> Deck.share_changeset(new_share_token()) |> Repo.update() do
      {:ok, deck} ->
        {:ok, Repo.preload(deck, deck_preloads())}

      {:error, changeset} ->
        if Keyword.has_key?(changeset.errors, :share_token) do
          deck
          |> Map.fetch!(:id)
          |> get_deck!()
          |> put_deck_share_token(attempts - 1)
        else
          {:error, changeset}
        end
    end
  end

  defp new_share_token do
    @share_token_bytes
    |> :crypto.strong_rand_bytes()
    |> Base.url_encode64(padding: false)
  end

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

  def set_deck_commander(%DeckCard{} = deck_card) do
    Repo.transaction(fn ->
      deck_card = Repo.preload(deck_card, [:card, :preferred_printing])

      unless legendary_creature?(deck_card) do
        Repo.rollback(:not_legendary_creature)
      end

      DeckCard
      |> where(
        [card],
        card.deck_id == ^deck_card.deck_id and card.zone == "commander" and
          card.id != ^deck_card.id
      )
      |> Repo.all()
      |> Enum.each(&move_deck_card_to_zone!(&1, "mainboard"))

      deck_card
      |> move_deck_card_to_zone!("commander")
      |> Repo.preload([:card, :preferred_printing])
    end)
  end

  def delete_deck_card(%DeckCard{} = deck_card) do
    Repo.transaction(fn ->
      deck_card =
        Repo.preload(deck_card, deck_allocations: [:collection_item])

      Enum.each(deck_card.deck_allocations, fn allocation ->
        restore_collection_item_from_deck!(
          allocation.collection_item,
          allocation.quantity,
          allocation.source_location_id
        )

        case Repo.delete(allocation) do
          {:ok, _allocation} -> :ok
          {:error, changeset} -> Repo.rollback(changeset)
        end
      end)

      case Repo.delete(deck_card) do
        {:ok, deck_card} -> deck_card
        {:error, changeset} -> Repo.rollback(changeset)
      end
    end)
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
    deck_card = load_deck_card_for_allocation_status(deck_card)

    candidates = deck_card_collection_candidates(deck_card)
    current_allocations = current_allocation_counts(deck_card.id)
    other_allocations = other_reserving_allocation_counts(deck_card)

    owned = Enum.reduce(candidates, 0, &(&1.quantity + &2))
    proxy_allocated = deck_card.proxy_quantity || 0
    physical_allocated = current_allocations |> Map.values() |> Enum.sum()
    allocated = physical_allocated + proxy_allocated
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
      proxy_allocated: proxy_allocated,
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

  defp load_deck_card_for_allocation_status(%DeckCard{id: nil} = deck_card) do
    Repo.preload(deck_card, [:deck, :preferred_printing, card: [], deck_allocations: []])
  end

  defp load_deck_card_for_allocation_status(%DeckCard{id: id}) do
    DeckCard
    |> Repo.get!(id)
    |> Repo.preload([:deck, :preferred_printing, card: [], deck_allocations: []])
  end

  def allocate_collection_item_to_deck_card(deck_card_id, collection_item_id, quantity \\ 1) do
    quantity = Util.parse_quantity(quantity)

    Repo.transaction(fn ->
      deck_card =
        DeckCard |> Repo.get!(deck_card_id) |> Repo.preload([:deck, :preferred_printing])

      item = Collection.get_collection_item!(collection_item_id)

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
    quantity = Util.parse_quantity(quantity)

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

  def allocate_proxy_to_deck_card(deck_card_id, quantity \\ 1) do
    quantity = Util.parse_quantity(quantity)

    Repo.transaction(fn ->
      deck_card =
        DeckCard
        |> Repo.get!(deck_card_id)
        |> Repo.preload([:deck, :preferred_printing, card: []])

      with :ok <- validate_positive_allocation_quantity(quantity),
           :ok <- validate_deck_card_proxy_allocation_room(deck_card, quantity) do
        deck_card
        |> put_deck_card_proxy_quantity((deck_card.proxy_quantity || 0) + quantity)
        |> case do
          {:ok, deck_card} -> deck_card
          {:error, changeset} -> Repo.rollback(changeset)
        end
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  def deallocate_proxy_from_deck_card(deck_card_id, quantity \\ 1) do
    quantity = Util.parse_quantity(quantity)

    Repo.transaction(fn ->
      deck_card = Repo.get!(DeckCard, deck_card_id)
      proxy_quantity = deck_card.proxy_quantity || 0

      with :ok <- validate_positive_allocation_quantity(quantity),
           :ok <- validate_deck_card_proxy_deallocation(deck_card, quantity) do
        next_quantity = max(proxy_quantity - quantity, 0)

        deck_card
        |> put_deck_card_proxy_quantity(next_quantity)
        |> case do
          {:ok, deck_card} -> deck_card
          {:error, changeset} -> Repo.rollback(changeset)
        end
      else
        {:error, reason} -> Repo.rollback(reason)
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

  def import_decklist(%Deck{} = deck, text, opts \\ []) when is_binary(text) and is_list(opts) do
    entries = Decklists.parse(text)
    replace? = Keyword.get(opts, :replace?, false)

    Repo.transaction(fn ->
      if replace?, do: delete_deck_cards_for_import!(deck)

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

  defp delete_deck_cards_for_import!(%Deck{} = deck) do
    deck =
      deck
      |> Repo.preload([deck_cards: [deck_allocations: [:collection_item]]], force: true)

    Enum.each(deck.deck_cards, fn deck_card ->
      case delete_deck_card(deck_card) do
        {:ok, _deck_card} -> :ok
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  def export_decklist(%Deck{} = deck) do
    deck
    |> Repo.preload(deck_preloads(), force: true)
    |> Map.fetch!(:deck_cards)
    |> Decklists.export()
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

  def deck_edhrec(%Deck{} = deck, opts \\ []) when is_list(opts) do
    EDHRec.recs(deck, opts)
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
    |> Enum.map_join("\n", &CSV.row/1)
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
      total:
        cards
        |> Enum.filter(&DeckCard.counts_toward_deck_total?/1)
        |> Enum.reduce(0, &(&1.quantity + &2)),
      zones: count_deck_groups(cards, & &1.zone),
      colors: deck_color_counts(cards),
      types: count_deck_groups(cards, &deck_card_type/1)
    }
  end

  defp deck_card_collection_candidates(%DeckCard{} = deck_card) do
    preferred_printing_id = deck_card.preferred_printing_id
    oracle_id = deck_card.oracle_id
    finish = deck_card.finish

    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:inner, [_item, printing], card in assoc(printing, :card))
    |> join(:left, [item, _printing, _card], location in assoc(item, :location_assoc))
    |> where(
      [item, printing, _card, location],
      printing.oracle_id == ^oracle_id and item.finish == ^finish
    )
    |> where([_item, _printing, _card, location], is_nil(location.id) or location.kind != "list")
    |> preload([_item, printing, card, _location], printing: {printing, card: card})
    |> order_by([item, printing, card, _location],
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
      Finishes.supports?(deck_card.preferred_printing, deck_card.finish) ->
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
    |> Enum.filter(&Finishes.supports?(&1, deck_card.finish))
    |> Enum.sort_by(fn printing ->
      {Price.price_cents_for_printing(printing, deck_card.finish) || 999_999_999,
       printing.released_at || ~D[9999-12-31], printing.set_code || "",
       printing.collector_number || ""}
    end)
    |> List.first()
  end

  defp buylist_reason(missing, unavailable) when missing > 0 and unavailable > 0,
    do: "missing and owned but unavailable"

  defp buylist_reason(missing, _unavailable) when missing > 0, do: "missing"
  defp buylist_reason(_missing, unavailable) when unavailable > 0, do: "owned but unavailable"
  defp buylist_reason(_missing, _unavailable), do: "available"

  defp price_total_cents(nil, _quantity), do: nil
  defp price_total_cents(price_cents, quantity), do: price_cents * quantity

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
    item = Repo.preload(item, [:printing, :location_assoc])

    cond do
      match?(%Location{kind: "list"}, item.location_assoc) -> {:error, :allocation_list_location}
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

  defp validate_deck_card_proxy_allocation_room(%DeckCard{} = deck_card, quantity) do
    status = deck_card_allocation_status(deck_card)

    if status.allocated + quantity > status.required do
      {:error, :deck_card_already_allocated}
    else
      :ok
    end
  end

  defp validate_deck_card_proxy_deallocation(%DeckCard{} = deck_card, quantity) do
    proxy_quantity = deck_card.proxy_quantity || 0

    cond do
      proxy_quantity <= 0 -> {:error, :proxy_allocation_not_found}
      quantity > proxy_quantity -> {:error, :proxy_allocation_not_found}
      true -> :ok
    end
  end

  defp validate_positive_allocation_quantity(quantity) when quantity > 0, do: :ok

  defp validate_positive_allocation_quantity(_quantity),
    do: {:error, :invalid_allocation_quantity}

  defp put_deck_card_proxy_quantity(%DeckCard{} = deck_card, proxy_quantity) do
    deck_card
    |> DeckCard.changeset(%{"proxy_quantity" => proxy_quantity})
    |> Repo.update()
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
    case Collection.update_collection_item(item, attrs) do
      {:ok, item} -> item
      {:error, changeset} -> Repo.rollback(changeset)
    end
  end

  defp create_collection_item_or_rollback!(attrs) do
    case Collection.create_collection_item(attrs) do
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
    quantity = Util.parse_quantity(Map.get(attrs, "quantity", 1))

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
    normalized_name = Decklists.normalize_card_name(name)

    Repo.one(
      from card in Card,
        where: fragment("lower(?) = ?", card.name, ^String.downcase(normalized_name)),
        order_by: [asc: card.name],
        limit: 1
    )
  end

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

  defp move_deck_card_to_zone!(%DeckCard{} = deck_card, zone) do
    existing =
      DeckCard
      |> where(
        [card],
        card.deck_id == ^deck_card.deck_id and card.oracle_id == ^deck_card.oracle_id and
          card.zone == ^zone and card.id != ^deck_card.id
      )
      |> Repo.one()

    case existing do
      %DeckCard{} = existing ->
        merged =
          existing
          |> DeckCard.changeset(%{"quantity" => existing.quantity + deck_card.quantity})
          |> Repo.update!()

        Repo.delete!(deck_card)
        merged

      nil ->
        deck_card
        |> DeckCard.changeset(%{"zone" => zone})
        |> Repo.update!()
    end
  end

  defp legendary_creature?(%DeckCard{card: %Card{type_line: type_line}})
       when is_binary(type_line) do
    String.contains?(type_line, "Legendary") and String.contains?(type_line, "Creature")
  end

  defp legendary_creature?(_deck_card), do: false

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
      colors = deck_card.card.color_identity |> Util.decode_json([]) |> List.wrap()

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
end
