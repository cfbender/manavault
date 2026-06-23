defmodule ManavaultWeb.Schema.Catalog.QueryResolvers do
  @moduledoc false

  alias Manavault.Catalog
  alias ManavaultWeb.Schema.Catalog.{CollectionFields, Errors}

  def home_summary(_parent, _args, _resolution) do
    {:ok,
     %{
       collection_count: Catalog.count_collection_items(),
       location_count: Catalog.count_locations(),
       deck_count: Catalog.count_decks()
     }}
  end

  def cards(_parent, args, _resolution) do
    {:ok, Catalog.search_cards(Map.get(args, :q, ""), limit: Map.get(args, :limit, 24))}
  end

  def card_name_suggestions(_parent, args, _resolution) do
    {:ok, Catalog.suggest_card_names(Map.get(args, :q, ""), limit: Map.get(args, :limit, 5))}
  end

  def card(_parent, %{id: id}, _resolution), do: {:ok, Catalog.get_card_with_printings(id)}

  def reload_scryfall_catalog(_parent, _args, _resolution) do
    case Catalog.reload_scryfall_catalog_async() do
      :ok ->
        {:ok,
         %{
           status: "queued",
           message: "Scryfall catalog reload queued."
         }}

      :not_started ->
        {:error, "Scryfall sync worker is not running."}
    end
  end

  def reload_scryfall_assets(_parent, _args, _resolution) do
    case Catalog.reload_scryfall_assets_async() do
      :ok ->
        {:ok,
         %{
           status: "queued",
           message: "Scryfall symbol and set icon reload queued."
         }}

      :not_started ->
        {:error, "Scryfall sync worker is not running."}
    end
  end

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
    {:ok, Catalog.collection_value_summary() |> CollectionFields.collection_value_summary_data()}
  end

  def collection_export_csv(_parent, args, _resolution) do
    filters = args |> Map.get(:filters, %{}) |> Enum.into([])
    {:ok, Catalog.export_collection_csv(filters)}
  end

  def collection_export_text(_parent, args, _resolution) do
    filters = args |> Map.get(:filters, %{}) |> Enum.into([])
    {:ok, Catalog.export_collection_text(filters)}
  end

  def locations(_parent, _args, _resolution) do
    summaries = Catalog.location_summaries()

    {:ok, Catalog.list_location_summaries(summaries) ++ [unfiled_location(summaries)]}
  end

  def location(_parent, %{id: id}, _resolution) do
    case to_string(id) do
      "unfiled" ->
        {:ok, unfiled_location()}

      _other ->
        {:ok, id |> location_id() |> Catalog.get_location_summary!()}
    end
  end

  def decks(_parent, _args, _resolution), do: {:ok, Catalog.list_deck_summaries()}

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
      {:error, reason} -> {:error, Errors.edhrec_error(reason)}
    end
  end

  defp deck_buylist_opts(args) do
    [
      printing_mode: Map.get(args, :printing_mode, "none"),
      include_basic_lands: Map.get(args, :include_basic_lands, false)
    ]
  end

  defp unfiled_location(summaries \\ nil) do
    summary = Catalog.unfiled_location_summary(summaries)

    %{
      id: "unfiled",
      name: "Unfiled",
      kind: "unfiled",
      description: "Cards without an assigned location.",
      cover_printing: nil,
      item_count: summary.item_count,
      total_price_cents: summary.total_price_cents,
      purchase_price_cents: summary.purchase_price_cents
    }
  end

  defp location_id(id) when is_integer(id), do: id

  defp location_id(id) when is_binary(id) do
    case Integer.parse(id) do
      {parsed, ""} -> parsed
      _other -> id
    end
  end
end
