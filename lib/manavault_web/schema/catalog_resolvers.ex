defmodule ManavaultWeb.Schema.CatalogResolvers do
  import Ecto.Query

  alias Manavault.Catalog

  alias Manavault.Catalog.{
    CollectionItem,
    Deck,
    DeckAllocation,
    DeckCard,
    Location,
    Price,
    Printing,
    ScanSession
  }

  alias Manavault.Repo

  def home_summary(_parent, _args, _resolution) do
    {:ok,
     %{
       collection_count: length(Catalog.list_collection_items([], limit: 10_000)),
       location_count: length(Catalog.list_locations()),
       deck_count: length(Catalog.list_decks()),
       scan_session_count: length(Catalog.list_scan_sessions())
     }}
  end

  def cards(_parent, args, _resolution) do
    {:ok, Catalog.search_cards(Map.get(args, :q, ""), limit: Map.get(args, :limit, 24))}
  end

  def card_name_suggestions(_parent, args, _resolution) do
    {:ok, Catalog.suggest_card_names(Map.get(args, :q, ""), limit: Map.get(args, :limit, 5))}
  end

  def card(_parent, %{id: id}, _resolution), do: {:ok, Catalog.get_card_with_printings(id)}

  def collection_items(_parent, args, _resolution) do
    filters = args |> Map.get(:filters, %{}) |> Enum.into([])

    opts = [
      limit: Map.get(args, :limit, 100),
      offset: Map.get(args, :offset, 0),
      sort: Map.get(args, :sort, %{})
    ]

    {:ok, Catalog.list_collection_items(filters, opts)}
  end

  def collection_item_count(_parent, args, _resolution) do
    filters = args |> Map.get(:filters, %{}) |> Enum.into([])
    {:ok, Catalog.count_collection_items(filters)}
  end

  def collection_value_summary(_parent, _args, _resolution) do
    items = Catalog.list_collection_items([], limit: 100_000)
    {:ok, collection_value_summary(items)}
  end

  def collection_export_csv(_parent, args, _resolution) do
    filters = args |> Map.get(:filters, %{}) |> Enum.into([])
    {:ok, Catalog.export_collection_csv(filters)}
  end

  def locations(_parent, _args, _resolution),
    do: {:ok, Catalog.list_locations() ++ [unfiled_location()]}

  def location(_parent, %{id: id}, _resolution) do
    case to_string(id) do
      "unfiled" ->
        {:ok, unfiled_location()}

      _other ->
        {:ok,
         id |> location_id() |> Catalog.get_location!() |> Repo.preload(cover_printing: :card)}
    end
  end

  def decks(_parent, _args, _resolution), do: {:ok, Catalog.list_decks()}

  def deck(_parent, %{id: id}, _resolution), do: {:ok, Catalog.get_deck!(id)}

  def shared_deck(_parent, %{token: token}, _resolution),
    do: {:ok, Catalog.get_deck_by_share_token(token)}

  def deck_export_text(_parent, %{id: id}, _resolution) do
    {:ok, id |> Catalog.get_deck!() |> Catalog.export_decklist()}
  end

  def deck_buylist(_parent, %{id: id} = args, _resolution) do
    {:ok, id |> Catalog.get_deck!() |> Catalog.deck_buylist(deck_buylist_opts(args))}
  end

  def deck_buylist_export(_parent, %{id: id} = args, _resolution) do
    format = Map.get(args, :format, "text")

    {:ok,
     id |> Catalog.get_deck!() |> Catalog.export_deck_buylist(format, deck_buylist_opts(args))}
  end

  def deck_edhrec(_parent, %{id: id} = args, _resolution) do
    opts = [
      exclude_lands: Map.get(args, :exclude_lands, false),
      offset: Map.get(args, :offset, 0)
    ]

    case id |> Catalog.get_deck!() |> Catalog.deck_edhrec(opts) do
      {:ok, result} -> {:ok, result}
      {:error, reason} -> {:error, edhrec_error(reason)}
    end
  end

  def create_deck(_parent, %{input: input}, _resolution) do
    case Catalog.create_deck(input) do
      {:ok, deck} -> {:ok, deck}
      {:error, changeset} -> {:error, changeset_error_message(changeset)}
    end
  end

  def create_collection_item(_parent, %{input: input}, _resolution) do
    input = normalize_blank_location_id(input)

    case Catalog.create_collection_item(input) do
      {:ok, item} -> {:ok, Catalog.get_collection_item!(item.id)}
      {:error, changeset} -> {:error, changeset_error_message(changeset)}
    end
  end

  def update_collection_item(_parent, %{id: id, input: input}, _resolution) do
    item = Catalog.get_collection_item!(id)
    input = normalize_blank_location_id(input)

    case Catalog.update_collection_item(item, input) do
      {:ok, item} -> {:ok, Catalog.get_collection_item!(item.id)}
      {:error, changeset} -> {:error, changeset_error_message(changeset)}
    end
  end

  def delete_collection_item(_parent, %{id: id}, _resolution) do
    item = Catalog.get_collection_item!(id)

    case Catalog.delete_collection_item(item) do
      {:ok, item} -> {:ok, item}
      {:error, changeset} -> {:error, changeset_error_message(changeset)}
    end
  end

  def add_collection_item_to_deck(_parent, %{id: id, deck_id: deck_id} = args, _resolution) do
    item = Catalog.get_collection_item!(id)
    deck = Catalog.get_deck!(deck_id)
    zone = Map.get(args, :zone, "mainboard")

    attrs = %{
      "oracle_id" => item.printing.card.oracle_id,
      "preferred_printing_id" => item.scryfall_id,
      "finish" => item.finish,
      "quantity" => 1,
      "zone" => zone
    }

    with {:ok, deck_card} <- Catalog.add_card_to_deck(deck, attrs),
         {:ok, _allocation} <-
           Catalog.allocate_collection_item_to_deck_card(deck_card.id, item.id, 1) do
      {:ok, Repo.preload(deck_card, [:card, :preferred_printing])}
    else
      {:error, changeset} when is_struct(changeset, Ecto.Changeset) ->
        {:error, changeset_error_message(changeset)}

      {:error, reason} ->
        {:error, deck_allocation_error(reason)}
    end
  end

  def create_location(_parent, %{input: input}, _resolution) do
    case Catalog.create_location(input) do
      {:ok, location} -> {:ok, Repo.preload(location, cover_printing: :card)}
      {:error, changeset} -> {:error, changeset_error_message(changeset)}
    end
  end

  def preview_collection_import(_parent, %{input: input}, _resolution) do
    case Catalog.preview_collection_import_csv(input.csv,
           location_id: Map.get(input, :location_id)
         ) do
      {:ok, preview} -> {:ok, preview}
      {:error, reason} -> {:error, import_error(reason)}
    end
  end

  def commit_collection_import(_parent, %{input: %{rows: rows}}, _resolution) do
    case Catalog.import_collection_preview(%{rows: Enum.map(rows, &collection_import_row/1)}) do
      {:ok, result} ->
        {:ok, %{imported: result.imported, skipped: result.skipped}}

      {:error, changeset} when is_struct(changeset, Ecto.Changeset) ->
        {:error, changeset_error_message(changeset)}

      {:error, reason} ->
        {:error, import_error(reason)}
    end
  end

  def update_deck(_parent, %{id: id, input: input}, _resolution) do
    deck = Catalog.get_deck!(id)

    case Catalog.update_deck(deck, input) do
      {:ok, deck} -> {:ok, Catalog.get_deck!(deck.id)}
      {:error, changeset} -> {:error, changeset_error_message(changeset)}
    end
  end

  def ensure_deck_share_token(_parent, %{id: id}, _resolution) do
    id
    |> Catalog.get_deck!()
    |> Catalog.ensure_deck_share_token()
    |> case do
      {:ok, deck} -> {:ok, deck}
      {:error, :share_token_collision} -> {:error, "Could not generate a unique share link."}
      {:error, changeset} -> {:error, changeset_error_message(changeset)}
    end
  end

  def add_deck_card(_parent, %{deck_id: deck_id, input: input}, _resolution) do
    deck = Catalog.get_deck!(deck_id)

    case Catalog.add_card_to_deck(deck, input) do
      {:ok, deck_card} ->
        {:ok, Repo.preload(deck_card, [:card, :preferred_printing])}

      {:error, :card_not_found} ->
        {:error, "Card was not found."}

      {:error, changeset} when is_struct(changeset, Ecto.Changeset) ->
        {:error, changeset_error_message(changeset)}

      {:error, reason} when is_binary(reason) ->
        {:error, reason}

      {:error, reason} when is_atom(reason) ->
        {:error, Atom.to_string(reason)}
    end
  end

  def import_decklist(_parent, %{id: id, text: text}, _resolution) do
    deck = Catalog.get_deck!(id)

    case Catalog.import_decklist(deck, text) do
      {:ok, result} ->
        {:ok, result}

      {:error, changeset} when is_struct(changeset, Ecto.Changeset) ->
        {:error, changeset_error_message(changeset)}

      {:error, reason} ->
        {:error, deck_import_error(reason)}
    end
  end

  def update_location(_parent, %{id: id, input: input}, _resolution) do
    if to_string(id) == "unfiled" do
      {:error, "Unfiled cannot be edited"}
    else
      update_persisted_location(id, input)
    end
  end

  defp update_persisted_location(id, input) do
    location = id |> location_id() |> Catalog.get_location!()

    case Catalog.update_location(location, input) do
      {:ok, location} -> {:ok, Repo.preload(location, cover_printing: :card)}
      {:error, changeset} -> {:error, changeset_error_message(changeset)}
    end
  end

  def update_deck_card(_parent, %{id: id, input: input}, _resolution) do
    deck_card = DeckCard |> Repo.get!(id) |> Repo.preload([:card, :preferred_printing])

    case Catalog.update_deck_card(deck_card, input) do
      {:ok, deck_card} -> {:ok, Repo.preload(deck_card, [:card, :preferred_printing])}
      {:error, changeset} -> {:error, changeset_error_message(changeset)}
    end
  end

  def delete_deck_card(_parent, %{id: id}, _resolution) do
    deck_card = DeckCard |> Repo.get!(id) |> Repo.preload([:card, :preferred_printing])

    case Catalog.delete_deck_card(deck_card) do
      {:ok, deck_card} -> {:ok, deck_card}
      {:error, changeset} -> {:error, changeset_error_message(changeset)}
    end
  end

  def set_deck_commander(_parent, %{id: id}, _resolution) do
    deck_card = DeckCard |> Repo.get!(id) |> Repo.preload([:card, :preferred_printing])

    case Catalog.set_deck_commander(deck_card) do
      {:ok, deck_card} -> {:ok, deck_card}
      {:error, :not_legendary_creature} -> {:error, "card must be a legendary creature"}
      {:error, changeset} -> {:error, changeset_error_message(changeset)}
    end
  end

  def allocate_deck_card_item(
        _parent,
        %{deck_card_id: deck_card_id, collection_item_id: collection_item_id},
        _resolution
      ) do
    case Catalog.allocate_collection_item_to_deck_card(deck_card_id, collection_item_id) do
      {:ok, _allocation} ->
        {:ok, DeckCard |> Repo.get!(deck_card_id) |> Repo.preload([:card, :preferred_printing])}

      {:error, reason} ->
        {:error, deck_allocation_error(reason)}
    end
  end

  def deallocate_deck_card_item(
        _parent,
        %{deck_card_id: deck_card_id, collection_item_id: collection_item_id},
        _resolution
      ) do
    case Catalog.deallocate_collection_item_from_deck_card(deck_card_id, collection_item_id) do
      {:ok, _allocation} ->
        {:ok, DeckCard |> Repo.get!(deck_card_id) |> Repo.preload([:card, :preferred_printing])}

      {:error, reason} ->
        {:error, deck_allocation_error(reason)}
    end
  end

  def allocate_deck_card_proxy(_parent, %{deck_card_id: deck_card_id} = args, _resolution) do
    quantity = Map.get(args, :quantity, 1)

    case Catalog.allocate_proxy_to_deck_card(deck_card_id, quantity) do
      {:ok, _deck_card} ->
        {:ok, DeckCard |> Repo.get!(deck_card_id) |> Repo.preload([:card, :preferred_printing])}

      {:error, reason} ->
        {:error, deck_allocation_error(reason)}
    end
  end

  def deallocate_deck_card_proxy(_parent, %{deck_card_id: deck_card_id} = args, _resolution) do
    quantity = Map.get(args, :quantity, 1)

    case Catalog.deallocate_proxy_from_deck_card(deck_card_id, quantity) do
      {:ok, _deck_card} ->
        {:ok, DeckCard |> Repo.get!(deck_card_id) |> Repo.preload([:card, :preferred_printing])}

      {:error, reason} ->
        {:error, deck_allocation_error(reason)}
    end
  end

  def preview_bulk_allocate_deck(_parent, %{id: id, mode: mode}, _resolution) do
    deck = Catalog.get_deck!(id)

    case Catalog.preview_bulk_allocate_deck(deck, mode) do
      {:ok, preview} -> {:ok, %{preview | mode: to_string(preview.mode)}}
      {:error, reason} -> {:error, deck_allocation_error(reason)}
    end
  end

  def bulk_allocate_deck(_parent, %{id: id, mode: mode}, _resolution) do
    deck = Catalog.get_deck!(id)

    case Catalog.bulk_allocate_deck(deck, mode) do
      {:ok, result} -> {:ok, result}
      {:error, reason} -> {:error, deck_allocation_error(reason)}
    end
  end

  def scan_sessions(_parent, _args, _resolution), do: {:ok, Catalog.list_scan_sessions()}

  def scan_session(_parent, %{id: id}, _resolution), do: {:ok, Catalog.get_scan_session!(id)}

  def scan_printings(_parent, args, _resolution) do
    {:ok,
     Catalog.search_printings([name: Map.get(args, :q, "")], limit: Map.get(args, :limit, 36))}
  end

  def scan_sets(_parent, args, _resolution), do: {:ok, Catalog.search_sets(Map.get(args, :q, ""))}

  def create_scan_session(_parent, %{input: input}, _resolution) do
    input =
      input
      |> put_generated_scan_session_name()
      |> normalize_blank_default_location_id()

    case Catalog.create_scan_session(input) do
      {:ok, session} -> {:ok, Catalog.get_scan_session!(session.id)}
      {:error, changeset} -> {:error, changeset_error_message(changeset)}
    end
  end

  def delete_scan_session(_parent, %{id: id}, _resolution) do
    session = Catalog.get_scan_session!(id)

    case Catalog.delete_scan_session(session) do
      {:ok, session} -> {:ok, session}
      {:error, changeset} -> {:error, changeset_error_message(changeset)}
    end
  end

  def capture_scan_item(
        _parent,
        %{scan_session_id: scan_session_id, image_data: image_data} = args,
        _resolution
      ) do
    ManavaultWeb.ScanCapture.capture(%{
      "scan_session_id" => scan_session_id,
      "image_data" => image_data,
      "force" => Map.get(args, :force, false),
      "last_oracle_id" => Map.get(args, :last_oracle_id),
      "prefer_foil" => Map.get(args, :prefer_foil, false),
      "set_codes" => Map.get(args, :set_codes, [])
    })
  end

  def update_scan_item(_parent, %{id: id, input: input}, _resolution) do
    scan_item = Catalog.get_scan_item!(id)

    case Catalog.update_scan_item_review(scan_item, input) do
      {:ok, scan_item} -> {:ok, Catalog.get_scan_item!(scan_item.id)}
      {:error, changeset} -> {:error, changeset_error_message(changeset)}
    end
  end

  def delete_scan_item(_parent, %{id: id}, _resolution) do
    scan_item = Catalog.get_scan_item!(id)

    case Catalog.delete_scan_item(scan_item) do
      {:ok, scan_item} -> {:ok, scan_item}
      {:error, changeset} -> {:error, changeset_error_message(changeset)}
    end
  end

  def set_scan_item_printing(_parent, %{id: id, scryfall_id: scryfall_id}, _resolution) do
    case Catalog.set_scan_item_printing(id, scryfall_id) do
      {:ok, scan_item} -> {:ok, scan_item}
      {:error, reason} -> {:error, scan_move_error(reason)}
    end
  end

  def move_scan_session_items(_parent, %{id: id} = args, _resolution) do
    session = Catalog.get_scan_session!(id)
    location_id = Map.get(args, :location_id)

    case Catalog.move_scan_session_items(session, location_id) do
      {:ok, result} ->
        case Catalog.delete_scan_session(session) do
          {:ok, _session} ->
            {:ok, Map.put(result, :location_id, normalize_result_location_id(location_id))}

          {:error, changeset} ->
            {:error, changeset_error_message(changeset)}
        end

      {:error, reason} ->
        {:error, scan_move_error(reason)}
    end
  end

  def scan_session_items(%ScanSession{} = session, _args, _resolution) do
    {:ok, session |> scan_items() |> Enum.sort_by(& &1.id, :desc)}
  end

  def printing_image_url(%Printing{} = printing, _args, _resolution) do
    image_uris = decode_json(printing.image_uris, %{})
    {:ok, image_url(image_uris)}
  end

  def printing_image_url(_printing, _args, _resolution), do: {:ok, nil}

  def printing_art_crop_url(%Printing{} = printing, _args, _resolution) do
    image_uris = decode_json(printing.image_uris, %{})
    {:ok, art_crop_url(image_uris)}
  end

  def printing_art_crop_url(_printing, _args, _resolution), do: {:ok, nil}

  def printing_price_text(%Printing{} = printing, _args, _resolution) do
    {:ok, Price.text_for_printing(printing)}
  end

  def decode_json_field(parent, key, fallback) do
    parent |> Map.get(key) |> decode_json(fallback)
  end

  def map_value(parent, _args, %{definition: %{schema_node: %{identifier: key}}}) do
    {:ok, Map.get(parent, key) || Map.get(parent, to_string(key))}
  end

  def map_exact_value(parent, _args, _resolution) do
    {:ok, Map.get(parent, :exact?) || Map.get(parent, "exact?") || false}
  end

  def buylist_entry_unit_price_text(parent, _args, _resolution) do
    {:ok, parent |> Map.get(:unit_price_cents) |> Price.format_cents()}
  end

  def buylist_entry_total_price_text(parent, _args, _resolution) do
    {:ok, parent |> Map.get(:total_price_cents) |> Price.format_cents()}
  end

  def scan_item_count(%ScanSession{} = session, _args, _resolution) do
    {:ok, session |> scan_items() |> length()}
  end

  def scan_review_count(%ScanSession{} = session, _args, _resolution) do
    count =
      session
      |> scan_items()
      |> Enum.count(&(&1.status == "needs_review"))

    {:ok, count}
  end

  def deck_card_count(%Deck{} = deck, _args, _resolution) do
    {:ok, deck |> deck_cards() |> Enum.reduce(0, &(&1.quantity + &2))}
  end

  def deck_unique_card_count(%Deck{} = deck, _args, _resolution) do
    {:ok, deck |> deck_cards() |> length()}
  end

  def location_item_count(%Location{collection_items: items}, _args, _resolution)
      when is_list(items) do
    {:ok, Enum.reduce(items, 0, &((&1.quantity || 0) + &2))}
  end

  def location_item_count(%Location{} = location, _args, _resolution) do
    {:ok, Catalog.count_collection_items(location_id: to_string(location.id))}
  end

  def location_item_count(%{id: "unfiled"}, _args, _resolution) do
    {:ok, Catalog.count_collection_items(location_id: "unfiled")}
  end

  def location_total_price_cents(parent, _args, _resolution) do
    {:ok, parent |> location_items() |> Price.collection_items_total_cents()}
  end

  def location_total_price_text(parent, _args, _resolution) do
    {:ok,
     parent |> location_items() |> Price.collection_items_total_cents() |> Price.format_cents()}
  end

  def location_purchase_price_cents(parent, _args, _resolution) do
    {:ok, parent |> location_items() |> Price.collection_items_purchase_total_cents()}
  end

  def location_purchase_price_text(parent, _args, _resolution) do
    {:ok,
     parent
     |> location_items()
     |> Price.collection_items_purchase_total_cents()
     |> Price.format_cents()}
  end

  def location_value_gain_cents(parent, _args, _resolution) do
    {:ok, parent |> location_items() |> Price.collection_items_value_gain_cents()}
  end

  def location_value_gain_text(parent, _args, _resolution) do
    {:ok,
     parent
     |> location_items()
     |> Price.collection_items_value_gain_cents()
     |> Price.format_signed_cents()}
  end

  def location_value_gain_percent(parent, _args, _resolution) do
    {:ok, parent |> location_items() |> Price.collection_items_value_gain_percent()}
  end

  def location_value_gain_percent_text(parent, _args, _resolution) do
    {:ok,
     parent
     |> location_items()
     |> Price.collection_items_value_gain_percent()
     |> Price.format_percent()}
  end

  def location_value_summary(parent, _args, _resolution) do
    {:ok, parent |> location_items() |> collection_value_summary()}
  end

  def location_collection_items(%Location{id: id}, args, _resolution) do
    filters = [location_id: to_string(id)]
    opts = [limit: Map.get(args, :limit, 100), offset: Map.get(args, :offset, 0)]
    {:ok, Catalog.list_collection_items(filters, opts)}
  end

  def location_collection_items(%{id: "unfiled"}, args, _resolution) do
    filters = [location_id: "unfiled"]
    opts = [limit: Map.get(args, :limit, 100), offset: Map.get(args, :offset, 0)]
    {:ok, Catalog.list_collection_items(filters, opts)}
  end

  def collection_item_location(
        %CollectionItem{location_assoc: %Location{} = location},
        _args,
        _resolution
      ),
      do: {:ok, location}

  def collection_item_location(%CollectionItem{location_assoc: nil}, _args, _resolution),
    do: {:ok, nil}

  def collection_item_location(%CollectionItem{} = item, _args, _resolution) do
    {:ok, item |> Repo.preload(:location_assoc) |> Map.get(:location_assoc)}
  end

  def collection_item_current_price_cents(%CollectionItem{} = item, _args, _resolution) do
    {:ok, Price.collection_item_price_cents(item)}
  end

  def collection_item_purchase_price_cents(%CollectionItem{} = item, _args, _resolution) do
    {:ok, Price.collection_item_purchase_price_cents(item)}
  end

  def collection_item_price_text(%CollectionItem{} = item, _args, _resolution) do
    {:ok, Price.text_for_collection_item(item)}
  end

  def collection_item_purchase_price_text(%CollectionItem{} = item, _args, _resolution) do
    {:ok, Price.purchase_text_for_collection_item(item)}
  end

  def collection_item_value_gain_cents(%CollectionItem{} = item, _args, _resolution) do
    {:ok, Price.collection_item_value_gain_cents(item)}
  end

  def collection_item_value_gain_text(%CollectionItem{} = item, _args, _resolution) do
    {:ok, item |> Price.collection_item_value_gain_cents() |> Price.format_signed_cents()}
  end

  def collection_item_value_gain_percent(%CollectionItem{} = item, _args, _resolution) do
    purchase = Price.collection_item_purchase_price_cents(item)
    gain = Price.collection_item_value_gain_cents(item)
    {:ok, value_gain_percent(gain, purchase)}
  end

  def collection_item_value_gain_percent_text(%CollectionItem{} = item, _args, _resolution) do
    purchase = Price.collection_item_purchase_price_cents(item)
    gain = Price.collection_item_value_gain_cents(item)
    {:ok, gain |> value_gain_percent(purchase) |> Price.format_percent()}
  end

  def collection_item_allocated_quantity(
        %CollectionItem{deck_allocations: allocations},
        _args,
        _resolution
      )
      when is_list(allocations) do
    {:ok, Enum.reduce(allocations, 0, &(&1.quantity + &2))}
  end

  def collection_item_allocated_quantity(%CollectionItem{id: id}, _args, _resolution) do
    allocated =
      DeckAllocation
      |> where([allocation], allocation.collection_item_id == ^id)
      |> Repo.aggregate(:sum, :quantity)

    {:ok, allocated || 0}
  end

  def deck_card_allocation_status(%DeckCard{} = deck_card, _args, _resolution) do
    status = Catalog.deck_card_allocation_status(deck_card)
    {:ok, %{status | state: to_string(status.state)}}
  end

  defp location_items(%Location{collection_items: items}) when is_list(items), do: items

  defp location_items(%Location{id: id}) do
    Catalog.list_collection_items([location_id: to_string(id)], limit: 100_000)
  end

  defp location_items(%{id: "unfiled"}) do
    Catalog.list_collection_items([location_id: "unfiled"], limit: 100_000)
  end

  defp collection_value_summary(items) do
    total = Price.collection_items_total_cents(items)
    purchase = Price.collection_items_purchase_total_cents(items)
    gain = total - purchase
    percent = value_gain_percent(gain, purchase)

    %{
      total_price_cents: total,
      total_price_text: Price.format_cents(total),
      purchase_price_cents: purchase,
      purchase_price_text: Price.format_cents(purchase),
      value_gain_cents: gain,
      value_gain_text: Price.format_signed_cents(gain),
      value_gain_percent: percent,
      value_gain_percent_text: Price.format_percent(percent)
    }
  end

  defp value_gain_percent(gain, purchase)
       when is_integer(gain) and is_integer(purchase) and purchase > 0 do
    gain * 100 / purchase
  end

  defp value_gain_percent(_gain, _purchase), do: nil

  defp scan_items(%ScanSession{scan_items: items}) when is_list(items), do: items

  defp scan_items(%ScanSession{} = session) do
    session
    |> Repo.preload(scan_items: [:location, accepted_printing: :card])
    |> Map.get(:scan_items)
  end

  defp deck_cards(%Deck{deck_cards: cards}) when is_list(cards), do: cards

  defp deck_cards(%Deck{} = deck) do
    deck |> Repo.preload(deck_cards: [printing: :card]) |> Map.get(:deck_cards)
  end

  defp changeset_error_message(%Ecto.Changeset{} = changeset) do
    changeset
    |> Ecto.Changeset.traverse_errors(fn {message, opts} ->
      Enum.reduce(opts, message, fn {key, value}, acc ->
        String.replace(acc, "%{#{key}}", to_string(value))
      end)
    end)
    |> Enum.map_join(", ", fn {field, messages} -> "#{field} #{Enum.join(messages, ", ")}" end)
  end

  defp decode_json(value, fallback) when is_binary(value) do
    case Jason.decode(value) do
      {:ok, decoded} -> decoded
      _ -> fallback
    end
  end

  defp decode_json(_value, fallback), do: fallback

  defp image_url(%{} = image_uris) do
    image_uris["normal"] || image_uris["large"] || image_uris["small"] || image_uris["png"]
  end

  defp image_url([first | _rest]), do: image_url(first)
  defp image_url(_image_uris), do: nil

  defp art_crop_url(%{} = image_uris) do
    image_uris["art_crop"] || image_url(image_uris)
  end

  defp art_crop_url([first | _rest]), do: art_crop_url(first)
  defp art_crop_url(_image_uris), do: nil

  defp location_id(id) when is_integer(id), do: id

  defp location_id(id) when is_binary(id) do
    case Integer.parse(id) do
      {parsed, ""} -> parsed
      _other -> id
    end
  end

  defp normalize_blank_location_id(%{location_id: ""} = input),
    do: Map.put(input, :location_id, nil)

  defp normalize_blank_location_id(input), do: input

  defp normalize_blank_default_location_id(%{default_location_id: ""} = input),
    do: Map.put(input, :default_location_id, nil)

  defp normalize_blank_default_location_id(input), do: input

  defp put_generated_scan_session_name(input) do
    case Map.get(input, :name) do
      name when is_binary(name) ->
        if String.trim(name) == "" do
          Map.put(input, :name, Catalog.generated_scan_session_name())
        else
          input
        end

      _other ->
        Map.put(input, :name, Catalog.generated_scan_session_name())
    end
  end

  defp normalize_result_location_id(nil), do: nil
  defp normalize_result_location_id(""), do: nil
  defp normalize_result_location_id(location_id), do: location_id

  defp scan_move_error(:location_not_found), do: "Location was not found."
  defp scan_move_error(%Ecto.Changeset{} = changeset), do: changeset_error_message(changeset)
  defp scan_move_error(reason) when is_binary(reason), do: reason
  defp scan_move_error(reason) when is_atom(reason), do: Atom.to_string(reason)
  defp scan_move_error(reason), do: inspect(reason)

  defp deck_buylist_opts(args) do
    [
      printing_mode: Map.get(args, :printing_mode, "none"),
      include_basic_lands: Map.get(args, :include_basic_lands, false)
    ]
  end

  defp unfiled_location do
    %{
      id: "unfiled",
      name: "Unfiled",
      kind: "unfiled",
      description: "Cards without an assigned location.",
      cover_printing: nil
    }
  end

  defp collection_import_row(row) do
    %{
      row_number: row.row_number,
      status: collection_import_status(row.status),
      attrs:
        row.attrs
        |> Map.new(fn {key, value} -> {to_string(key), value} end)
        |> Map.update("location_id", nil, &location_import_id/1),
      candidates: [],
      printing: nil
    }
  end

  defp location_import_id(nil), do: nil
  defp location_import_id(""), do: nil
  defp location_import_id(id), do: id

  defp collection_import_status(status) when status in [:exact, :ambiguous, :unresolved],
    do: status

  defp collection_import_status("exact"), do: :exact
  defp collection_import_status("ambiguous"), do: :ambiguous
  defp collection_import_status("unresolved"), do: :unresolved
  defp collection_import_status(_status), do: :unresolved

  defp import_error(:location_not_found), do: "Import location was not found."
  defp import_error(:invalid_csv), do: "Could not parse that CSV."
  defp import_error(:missing_csv_file), do: "Choose a CSV file to import."
  defp import_error(_reason), do: "Could not import collection CSV."

  defp deck_allocation_error(:collection_item_mismatch),
    do: "Collection item does not match that deck card."

  defp deck_allocation_error(:allocation_list_location),
    do: "List items cannot be allocated to decks."

  defp deck_allocation_error(:allocation_card_mismatch),
    do: "Collection item does not match that deck card."

  defp deck_allocation_error(:allocation_finish_mismatch),
    do: "Collection item finish does not match that deck card."

  defp deck_allocation_error(:allocation_exceeds_quantity),
    do: "No available copies remain for that collection item."

  defp deck_allocation_error(:allocation_exceeds_deck_card_quantity),
    do: "That deck card already has enough allocated copies."

  defp deck_allocation_error(:not_enough_available),
    do: "No available copies remain for that collection item."

  defp deck_allocation_error(:deck_card_already_allocated),
    do: "That deck card already has enough allocated copies."

  defp deck_allocation_error(:proxy_allocation_not_found), do: "Proxy allocation not found."
  defp deck_allocation_error(:invalid_allocation_quantity), do: "Allocation quantity is invalid."
  defp deck_allocation_error(:allocation_not_found), do: "Allocation not found."
  defp deck_allocation_error(reason) when is_binary(reason), do: reason
  defp deck_allocation_error(_reason), do: "Could not add collection item to deck."

  defp deck_import_error(:card_not_found), do: "One or more decklist cards were not found."
  defp deck_import_error(reason) when is_binary(reason), do: reason
  defp deck_import_error(_reason), do: "Could not import decklist."

  defp edhrec_error(:edhrec_missing_commander), do: "EDHREC requires a commander."
  defp edhrec_error(:edhrec_empty_deck), do: "EDHREC requires cards in the deck."
  defp edhrec_error(:edhrec_unexpected_response), do: "EDHREC returned an unexpected response."
  defp edhrec_error({:edhrec_http_error, status}), do: "EDHREC returned HTTP #{status}."
  defp edhrec_error({:edhrec_request_failed, reason}), do: "Could not reach EDHREC: #{reason}"
  defp edhrec_error(reason) when is_binary(reason), do: reason
  defp edhrec_error(_reason), do: "Could not load EDHREC data."
end
