defmodule Manavault.Catalog do
  @moduledoc """
  Local Scryfall catalog storage and sync functions.
  """

  import Ecto.Query

  alias Manavault.Catalog.{Card, CollectionItem, Location, Printing, Sync}
  alias Manavault.Repo

  @bulk_metadata_url "https://api.scryfall.com/bulk-data/default-cards"
  @bulk_type "default_cards"
  @batch_size 500

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

  def get_printing_by_scryfall_id(scryfall_id) when is_binary(scryfall_id) do
    Repo.get(Printing, scryfall_id)
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
    query = filters |> Keyword.get(:q, "") |> normalize_filter()

    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:inner, [item, printing], card in assoc(printing, :card))
    |> join(:left, [item, _printing, _card], location in assoc(item, :location_assoc))
    |> maybe_filter_collection_search(query)
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

  def list_printings_for_collection_item(%CollectionItem{printing: %{card: %{oracle_id: oracle_id}}}) do
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

  # ── Locations ──────────────────────────────────────────────────────

  def list_locations(_opts \\ []) do
    Location
    |> order_by(asc: :name)
    |> Repo.all()
    |> Repo.preload(collection_items: [])
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

    Repo.transaction(fn ->
      rows = Enum.flat_map(cards, &card_row(&1, now))
      printing_rows = Enum.flat_map(cards, &printing_row(&1, now))

      insert_in_batches(Card, rows,
        conflict_target: [:oracle_id],
        on_conflict:
          {:replace, [:name, :type_line, :oracle_text, :color_identity, :legalities, :updated_at]}
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
             :finishes,
             :image_uris,
             :prices,
             :released_at,
             :updated_at
           ]}
      )

      %{cards_count: length(rows), printings_count: length(printing_rows), bulk_uri: bulk_uri}
    end)
  end

  defp normalize_filter(value) when is_binary(value), do: String.trim(value)
  defp normalize_filter(_value), do: ""

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
      [_item, printing, card],
      fragment("lower(?) LIKE ?", card.name, ^pattern) or
        fragment("lower(?) LIKE ?", printing.set_code, ^pattern) or
        fragment("lower(?) LIKE ?", printing.collector_number, ^pattern) or
        fragment("lower(?) LIKE ?", printing.scryfall_id, ^pattern)
    )
  end

  defp insert_in_batches(_schema, [], _opts), do: :ok

  defp insert_in_batches(schema, rows, opts) do
    rows
    |> Enum.chunk_every(@batch_size)
    |> Enum.each(fn batch -> Repo.insert_all(schema, batch, opts) end)
  end

  defp card_row(%{"oracle_id" => oracle_id, "name" => name} = card, now)
       when is_binary(oracle_id) and is_binary(name) do
    [
      %{
        oracle_id: oracle_id,
        name: name,
        type_line: card["type_line"],
        oracle_text: oracle_text(card),
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
