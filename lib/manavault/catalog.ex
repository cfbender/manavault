defmodule Manavault.Catalog do
  @moduledoc """
  Local Scryfall catalog storage and sync functions.
  """

  import Ecto.Query

  alias Manavault.Catalog.{
    Card,
    CollectionItem,
    Location,
    Printing,
    ScanCandidate,
    ScanItem,
    ScanRecognition,
    ScanSession,
    Sync
  }

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

  def recognize_scan_item(%ScanItem{} = scan_item, opts \\ []) when is_list(opts) do
    with {:ok, recognition} <- ScanRecognition.recognize(scan_item, opts) do
      persist_recognition(scan_item, recognition)
    else
      {:error, reason} -> mark_scan_item_needs_review(scan_item, %{ocr_error: reason})
    end
  end

  def create_scan_candidate(%ScanItem{} = scan_item, attrs) when is_map(attrs) do
    attrs =
      attrs
      |> Map.new(fn {key, value} -> {to_string(key), value} end)
      |> Map.put_new("scan_item_id", scan_item.id)

    %ScanCandidate{}
    |> ScanCandidate.changeset(attrs)
    |> Repo.insert()
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

      {:ok, _candidate} =
        create_scan_candidate(updated_item, %{
          "printing_id" => printing.scryfall_id,
          "oracle_id" => printing.oracle_id,
          "source" => "user_search",
          "confidence" => 1.0,
          "rank" => next_candidate_rank(scan_item),
          "evidence" => Jason.encode!(%{selected_by: "manual_search"})
        })

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

  def accept_scan_item_best_candidate(scan_item_id) do
    scan_item = get_scan_item!(scan_item_id)

    case Enum.find(scan_item.scan_candidates, & &1.printing_id) do
      nil -> {:error, :missing_candidate}
      candidate -> accept_scan_item_printing(scan_item.id, candidate.printing_id)
    end
  end

  def accept_scan_item_candidate(scan_item_id, candidate_id) do
    scan_item = get_scan_item!(scan_item_id)
    candidate_id = parse_integer(candidate_id)

    case Enum.find(scan_item.scan_candidates, &(&1.id == candidate_id)) do
      nil -> {:error, :candidate_not_found}
      %{printing_id: nil} -> {:error, :missing_printing}
      candidate -> accept_scan_item_printing(scan_item.id, candidate.printing_id)
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

  defp persist_recognition(%ScanItem{} = scan_item, %{candidates: candidates} = recognition) do
    Repo.transaction(fn ->
      persisted_candidates =
        candidates
        |> Enum.with_index(1)
        |> Enum.map(fn {candidate, rank} ->
          {:ok, scan_candidate} =
            create_scan_candidate(scan_item, %{
              "printing_id" => candidate.printing.scryfall_id,
              "oracle_id" => candidate.printing.oracle_id,
              "source" => "ocr",
              "confidence" => candidate.confidence,
              "rank" => rank,
              "evidence" => Jason.encode!(candidate.evidence)
            })

          scan_candidate
        end)

      status = if persisted_candidates == [], do: "needs_review", else: "recognized"
      evidence = Map.take(recognition, [:text, :parsed])

      {:ok, updated_item} = update_scan_item_status(scan_item, status)

      if persisted_candidates == [] do
        {:ok, _candidate} =
          create_scan_candidate(updated_item, %{
            "source" => "ocr",
            "rank" => 1,
            "evidence" =>
              Jason.encode!(
                Map.put(evidence, :reason, "No local Scryfall candidates matched OCR output.")
              )
          })
      end

      Repo.preload(updated_item,
        scan_candidates:
          {from(candidate in ScanCandidate, order_by: [asc: candidate.rank, asc: candidate.id]),
           [printing: :card, card: []]}
      )
    end)
  end

  defp mark_scan_item_needs_review(%ScanItem{} = scan_item, evidence) when is_map(evidence) do
    Repo.transaction(fn ->
      {:ok, updated_item} = update_scan_item_status(scan_item, "needs_review")

      {:ok, _candidate} =
        create_scan_candidate(updated_item, %{
          "source" => "ocr",
          "rank" => 1,
          "evidence" => Jason.encode!(evidence)
        })

      Repo.preload(updated_item,
        scan_candidates:
          {from(candidate in ScanCandidate, order_by: [asc: candidate.rank, asc: candidate.id]),
           [printing: :card, card: []]}
      )
    end)
    |> case do
      {:ok, updated_item} ->
        {:error, Map.get(evidence, :ocr_error, "Recognition failed."), updated_item}

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

  defp next_candidate_rank(%ScanItem{scan_candidates: candidates}) when is_list(candidates) do
    candidates
    |> Enum.map(&(&1.rank || 0))
    |> Enum.max(fn -> 0 end)
    |> Kernel.+(1)
  end

  defp next_candidate_rank(_scan_item), do: 1

  defp parse_integer(value) when is_integer(value), do: value

  defp parse_integer(value) when is_binary(value) do
    case Integer.parse(value) do
      {integer, ""} -> integer
      _invalid -> nil
    end
  end

  defp parse_integer(_value), do: nil

  defp scan_session_preloads do
    [
      :default_location,
      scan_items: {from(item in ScanItem, order_by: [asc: item.id]), scan_item_preloads()}
    ]
  end

  defp scan_item_preloads do
    [
      :location,
      accepted_printing: :card,
      scan_candidates:
        {from(candidate in ScanCandidate,
           order_by: [asc: candidate.rank, asc: candidate.id]
         ), [printing: :card, card: []]}
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
