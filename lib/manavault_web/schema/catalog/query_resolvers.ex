defmodule ManavaultWeb.Schema.Catalog.QueryResolvers do
  @moduledoc false

  alias Manavault.Catalog
  alias Manavault.Catalog.DeckCard
  alias Manavault.Repo
  alias ManavaultWeb.Schema.Catalog.{CollectionFields, Errors}
  alias ManavaultWeb.Schema.RelayHelpers

  def home_summary(_parent, _args, _resolution) do
    {:ok,
     %{
       collection_count: Catalog.count_collection_items(),
       location_count: Catalog.count_locations(),
       deck_count: Catalog.count_decks()
     }}
  end

  def node(%{type: :card, id: id}, _resolution), do: {:ok, Catalog.get_card_with_printings(id)}

  def node(%{type: :printing, id: id}, _resolution),
    do: {:ok, Catalog.get_printing_by_scryfall_id(id)}

  def node(%{type: :collection_item, id: id}, _resolution),
    do: {:ok, Catalog.get_collection_item!(integer_id(id))}

  def node(%{type: :location, id: "unfiled"}, _resolution), do: {:ok, unfiled_location()}

  def node(%{type: :location, id: id}, _resolution),
    do: {:ok, Catalog.get_location_summary!(location_id(id))}

  def node(%{type: :deck, id: id}, _resolution),
    do: {:ok, Catalog.get_deck!(integer_id(id), preload?: false)}

  def node(%{type: :deck_card, id: id}, _resolution),
    do: {:ok, Repo.get!(DeckCard, integer_id(id))}

  def node(_args, _resolution), do: {:ok, nil}

  def cards(_parent, args, _resolution) do
    with {:ok, fetch_limit} <- RelayHelpers.fetch_limit(args, 24) do
      args
      |> Map.get(:q, "")
      |> Catalog.search_cards(limit: fetch_limit + 1)
      |> RelayHelpers.connection_from_list(args, 24)
    end
  end

  def card_name_suggestions(_parent, args, _resolution) do
    {:ok, Catalog.suggest_card_names(Map.get(args, :q, ""), limit: Map.get(args, :limit, 5))}
  end

  def set_suggestions(_parent, args, _resolution) do
    {:ok, Catalog.search_sets(Map.get(args, :q, ""), limit: Map.get(args, :limit, 8))}
  end

  def card(_parent, %{id: id}, resolution) do
    with {:ok, id} <- card_id(id, resolution) do
      {:ok, Catalog.get_card_with_printings(id)}
    end
  end

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

  def collection_items(_parent, args, resolution) do
    with {:ok, filters} <- collection_filters(args, resolution),
         total_count <- Catalog.count_collection_items(filters),
         {:ok, offset, limit} <- RelayHelpers.slice_window(args, total_count, 100) do
      opts = [limit: limit, offset: offset, sort: Map.get(args, :sort, %{})]

      filters
      |> Catalog.list_collection_items(opts)
      |> RelayHelpers.connection_from_slice(offset, limit, total_count)
    end
  end

  def collection_item_count(_parent, args, resolution) do
    with {:ok, filters} <- collection_filters(args, resolution) do
      {:ok, Catalog.count_collection_items(filters)}
    end
  end

  def collection_value_summary(_parent, _args, _resolution) do
    {:ok, Catalog.collection_value_summary() |> CollectionFields.collection_value_summary_data()}
  end

  def collection_export_csv(_parent, args, resolution) do
    with {:ok, filters} <- collection_filters(args, resolution) do
      {:ok, Catalog.export_collection_csv(filters)}
    end
  end

  def collection_export_text(_parent, args, resolution) do
    with {:ok, filters} <- collection_filters(args, resolution) do
      {:ok, Catalog.export_collection_text(filters)}
    end
  end

  def locations(_parent, args, _resolution) do
    summaries = Catalog.location_summaries()

    locations = Catalog.list_location_summaries(summaries) ++ [unfiled_location(summaries)]

    RelayHelpers.connection_from_list(locations, args)
  end

  def collection_auto_sort_rules(_parent, _args, _resolution) do
    {:ok, Catalog.list_collection_auto_sort_rules()}
  end

  def location(_parent, %{id: id}, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :location, resolution) do
      location_by_id(id)
    end
  end

  def decks(_parent, args, _resolution) do
    Catalog.list_deck_summaries()
    |> RelayHelpers.connection_from_list(args)
  end

  def deck(_parent, %{id: id}, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :deck, resolution) do
      {:ok, Catalog.get_deck!(id, preload?: false)}
    end
  end

  def shared_deck(_parent, %{token: token}, _resolution),
    do: {:ok, Catalog.get_deck_by_share_token(token, preload?: false)}

  def deck_export_text(_parent, %{id: id}, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :deck, resolution) do
      {:ok, id |> Catalog.get_deck!() |> Catalog.export_decklist()}
    end
  end

  def deck_buylist(_parent, %{id: id} = args, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :deck, resolution) do
      {:ok, id |> Catalog.get_deck!() |> Catalog.deck_buylist(deck_buylist_opts(args))}
    end
  end

  def deck_buylist_export(_parent, %{id: id} = args, resolution) do
    format = Map.get(args, :format, "text")

    with {:ok, id} <- RelayHelpers.node_id(id, :deck, resolution) do
      {:ok,
       id |> Catalog.get_deck!() |> Catalog.export_deck_buylist(format, deck_buylist_opts(args))}
    end
  end

  def deck_edhrec(_parent, %{id: id} = args, resolution) do
    opts = [
      exclude_lands: Map.get(args, :exclude_lands, false),
      offset: Map.get(args, :offset, 0)
    ]

    with {:ok, id} <- RelayHelpers.node_id(id, :deck, resolution) do
      case id |> Catalog.get_deck!() |> Catalog.deck_edhrec(opts) do
        {:ok, result} -> {:ok, result}
        {:error, reason} -> {:error, Errors.edhrec_error(reason)}
      end
    end
  end

  defp collection_filters(args, resolution) do
    with {:ok, filters} <-
           args
           |> Map.get(:filters, %{})
           |> Enum.into([])
           |> put_location_filter_id(resolution),
         {:ok, filters} <- put_card_filter_id(filters, resolution) do
      {:ok, stringify_filter_id(filters, :location_id)}
    end
  end

  defp put_location_filter_id(filters, resolution) do
    case Keyword.fetch(filters, :location_id) do
      {:ok, "unfiled"} -> {:ok, filters}
      _other -> RelayHelpers.put_filter_node_id(filters, :location_id, :location, resolution)
    end
  end

  defp put_card_filter_id(filters, resolution) do
    case Keyword.fetch(filters, :card_id) do
      {:ok, value} ->
        with {:ok, id} <- optional_card_id(value, resolution) do
          {:ok, Keyword.put(filters, :card_id, id)}
        end

      :error ->
        {:ok, filters}
    end
  end

  defp optional_card_id(nil, _resolution), do: {:ok, nil}
  defp optional_card_id("", _resolution), do: {:ok, nil}
  defp optional_card_id(id, resolution), do: card_id(id, resolution)

  defp stringify_filter_id(filters, key) do
    Keyword.update(filters, key, nil, fn
      nil -> nil
      id -> to_string(id)
    end)
  end

  defp card_id(id, resolution) do
    case RelayHelpers.node_id(id, :card, resolution) do
      {:ok, id} -> {:ok, id}
      {:error, _message} when is_binary(id) -> {:ok, id}
      {:error, message} -> {:error, message}
    end
  end

  defp deck_buylist_opts(args) do
    [
      printing_mode: Map.get(args, :printing_mode, "none"),
      include_basic_lands: Map.get(args, :include_basic_lands, false),
      assume_no_owned: Map.get(args, :assume_no_owned, false),
      include_sideboard: Map.get(args, :include_sideboard, false),
      include_maybeboard: Map.get(args, :include_maybeboard, false)
    ]
  end

  defp location_by_id("unfiled"), do: {:ok, unfiled_location()}
  defp location_by_id(id), do: {:ok, Catalog.get_location_summary!(location_id(id))}

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

  defp integer_id(id) when is_integer(id), do: id

  defp integer_id(id) when is_binary(id) do
    case Integer.parse(id) do
      {parsed, ""} -> parsed
      _other -> id
    end
  end

  defp location_id(id) when is_integer(id), do: id

  defp location_id(id) when is_binary(id) do
    case Integer.parse(id) do
      {parsed, ""} -> parsed
      _other -> id
    end
  end
end
