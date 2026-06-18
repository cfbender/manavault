defmodule ManavaultWeb.Schema.CatalogResolvers do
  import Ecto.Query

  alias Manavault.Catalog
  alias Manavault.Catalog.{CollectionItem, Deck, DeckAllocation, Location, Price, Printing, ScanSession}
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
    opts = [limit: Map.get(args, :limit, 100), offset: Map.get(args, :offset, 0)]
    {:ok, Catalog.list_collection_items(filters, opts)}
  end

  def locations(_parent, _args, _resolution), do: {:ok, Catalog.list_locations()}

  def location(_parent, %{id: id}, _resolution), do: {:ok, Catalog.get_location_with_items!(id)}

  def decks(_parent, _args, _resolution), do: {:ok, Catalog.list_decks()}

  def deck(_parent, %{id: id}, _resolution), do: {:ok, Catalog.get_deck!(id)}

  def scan_sessions(_parent, _args, _resolution), do: {:ok, Catalog.list_scan_sessions()}

  def printing_image_url(%Printing{} = printing, _args, _resolution) do
    image_uris = decode_json(printing.image_uris, %{})
    {:ok, image_url(image_uris)}
  end

  def printing_art_crop_url(%Printing{} = printing, _args, _resolution) do
    image_uris = decode_json(printing.image_uris, %{})
    {:ok, art_crop_url(image_uris)}
  end

  def decode_json_field(parent, key, fallback) do
    parent |> Map.get(key) |> decode_json(fallback)
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
    {:ok, length(items)}
  end

  def location_item_count(%Location{} = location, _args, _resolution) do
    location = Repo.preload(location, :collection_items)
    {:ok, length(location.collection_items)}
  end

  def collection_item_location(
        %CollectionItem{location_assoc: %Location{} = location},
        _args,
        _resolution
      ), do: {:ok, location}

  def collection_item_location(%CollectionItem{location_assoc: nil}, _args, _resolution),
    do: {:ok, nil}

  def collection_item_location(%CollectionItem{} = item, _args, _resolution) do
    {:ok, item |> Repo.preload(:location_assoc) |> Map.get(:location_assoc)}
  end

  def collection_item_price_text(%CollectionItem{} = item, _args, _resolution) do
    {:ok, Price.text_for_collection_item(item)}
  end

  def collection_item_allocated_quantity(%CollectionItem{deck_allocations: allocations}, _args, _resolution)
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

  defp scan_items(%ScanSession{scan_items: items}) when is_list(items), do: items

  defp scan_items(%ScanSession{} = session) do
    session |> Repo.preload(:scan_items) |> Map.get(:scan_items)
  end

  defp deck_cards(%Deck{deck_cards: cards}) when is_list(cards), do: cards

  defp deck_cards(%Deck{} = deck) do
    deck |> Repo.preload(deck_cards: [printing: :card]) |> Map.get(:deck_cards)
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
end
