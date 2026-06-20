defmodule Manavault.Catalog.Scans do
  @moduledoc false

  import Ecto.Query
  require Logger

  alias Manavault.Catalog.{
    Collection,
    CollectionItem,
    Finishes,
    Location,
    Printing,
    RuntimeImageMatcher,
    ScanItem,
    ScanRecognition,
    ScanSession
  }

  alias Manavault.Repo

  @scan_auto_accept_min_confidence 0.7
  @image_refinement_candidate_limit 40
  @image_refinement_threshold 0.82

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
         {:ok, scan_item} <- persist_recognized_capture(scan_session, path, recognition, opts) do
      log_capture_timing(started_at, recognition)
      maybe_refine_scan_item_printing_async(scan_item, recognition, opts)
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

  def refine_scan_item_printing_with_image(scan_item_id, opts \\ []) when is_list(opts) do
    started_at = System.monotonic_time(:microsecond)

    with %ScanItem{} = scan_item <- get_scan_item(scan_item_id),
         :ok <- refinable_scan_item?(scan_item),
         printings <- refinement_printings(scan_item, opts),
         %{scryfall_id: scryfall_id, score: score} <-
           best_refinement_match(scan_item.image_path, printings, opts) do
      apply_image_refinement(scan_item, scryfall_id, score, started_at, opts)
    else
      nil -> {:error, :not_found}
      :no_match -> {:ok, get_scan_item(scan_item_id) || %ScanItem{id: scan_item_id}}
      :skip -> {:ok, get_scan_item(scan_item_id) || %ScanItem{id: scan_item_id}}
      [] -> {:ok, get_scan_item(scan_item_id) || %ScanItem{id: scan_item_id}}
    end
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

      case Collection.create_collection_item(collection_attrs) do
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
                   Collection.create_collection_item(%{
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

  def delete_scan_item(%ScanItem{} = scan_item) do
    Repo.delete(scan_item)
  end

  def delete_scan_session(%ScanSession{} = scan_session) do
    Repo.delete(scan_session)
  end

  defp maybe_refine_scan_item_printing_async(scan_item, recognition, opts) do
    if async_image_refinement_enabled?(recognition, opts) do
      scan_item_id = scan_item.id
      task_opts = image_refinement_task_opts(opts)

      case Task.Supervisor.start_child(Manavault.ScanRecognitionSupervisor, fn ->
             case refine_scan_item_printing_with_image(scan_item_id, task_opts) do
               {:ok, _scan_item} ->
                 :ok

               {:error, :not_found} ->
                 :ok

               {:error, reason} ->
                 Logger.warning(
                   "Async scan image refinement failed for scan item #{scan_item_id}: #{inspect(reason)}"
                 )
             end
           end) do
        {:ok, _pid} ->
          :ok

        {:error, reason} ->
          Logger.warning(
            "Could not start async scan image refinement for scan item #{scan_item.id}: #{inspect(reason)}"
          )
      end
    end
  end

  defp async_image_refinement_enabled?(recognition, opts) do
    Keyword.get(
      opts,
      :async_image_refinement,
      Application.get_env(:manavault, :scan_async_image_refinement, true)
    ) and
      Application.get_env(:manavault, :scan_image_matching, true) and
      get_in(recognition, [:timings, :title_ocr_fast_path]) == true
  end

  defp image_refinement_task_opts(opts) do
    Keyword.take(opts, [
      :image_matcher,
      :image_refinement_limit,
      :image_refinement_threshold,
      :prefer_foil,
      :set_codes
    ])
  end

  defp get_scan_item(id) do
    case Repo.get(ScanItem, id) do
      nil -> nil
      scan_item -> Repo.preload(scan_item, scan_item_preloads(), force: true)
    end
  end

  defp refinable_scan_item?(%ScanItem{status: "recognized", accepted_printing_id: accepted_id})
       when is_binary(accepted_id),
       do: :ok

  defp refinable_scan_item?(_scan_item), do: :skip

  defp refinement_printings(%ScanItem{} = scan_item, opts) do
    scan_item
    |> Collection.list_printings_for_scan_item()
    |> filter_refinement_set_codes(opts)
  end

  defp filter_refinement_set_codes(printings, opts) do
    set_codes =
      opts
      |> Keyword.get(:set_codes, [])
      |> normalize_refinement_set_codes()

    if set_codes == [] do
      printings
    else
      Enum.filter(printings, &(String.downcase(&1.set_code || "") in set_codes))
    end
  end

  defp normalize_refinement_set_codes(values) when is_list(values) do
    values
    |> Enum.map(&to_string/1)
    |> Enum.map(&String.downcase/1)
    |> Enum.reject(&(&1 == ""))
  end

  defp normalize_refinement_set_codes(_values), do: []

  defp best_refinement_match(nil, _printings, _opts), do: :no_match
  defp best_refinement_match(_image_path, [], _opts), do: :no_match

  defp best_refinement_match(image_path, printings, opts) do
    allowed_ids = MapSet.new(printings, & &1.scryfall_id)
    match_opts = image_refinement_match_opts(opts)
    threshold = Keyword.fetch!(match_opts, :threshold)

    matches =
      image_refinement_matcher(opts).(
        image_path,
        printings,
        match_opts
      )
      |> normalize_refinement_matches()
      |> Enum.filter(&MapSet.member?(allowed_ids, &1.scryfall_id))
      |> Enum.filter(&(&1.score >= threshold))

    case List.first(matches) do
      nil -> :no_match
      match -> match
    end
  rescue
    exception ->
      Logger.warning(
        "Scan image refinement matching failed for #{image_path}: #{Exception.message(exception)}"
      )

      :no_match
  end

  defp image_refinement_match_opts(opts) do
    [
      limit: Keyword.get(opts, :image_refinement_limit, @image_refinement_candidate_limit),
      threshold: Keyword.get(opts, :image_refinement_threshold, @image_refinement_threshold)
    ]
  end

  defp image_refinement_matcher(opts) do
    cond do
      is_function(Keyword.get(opts, :image_matcher), 3) ->
        Keyword.get(opts, :image_matcher)

      is_function(Keyword.get(opts, :image_matcher), 2) ->
        matcher = Keyword.get(opts, :image_matcher)
        fn image_path, printings, _opts -> matcher.(image_path, printings) end

      is_function(Application.get_env(:manavault, :scan_image_matcher), 3) ->
        Application.get_env(:manavault, :scan_image_matcher)

      is_function(Application.get_env(:manavault, :scan_image_matcher), 2) ->
        matcher = Application.get_env(:manavault, :scan_image_matcher)
        fn image_path, printings, _opts -> matcher.(image_path, printings) end

      true ->
        &RuntimeImageMatcher.match/3
    end
  end

  defp normalize_refinement_matches(matches) when is_list(matches) do
    matches
    |> Enum.flat_map(fn
      %{scryfall_id: scryfall_id, score: score} when is_binary(scryfall_id) ->
        [%{scryfall_id: scryfall_id, score: float_score(score)}]

      %{"scryfall_id" => scryfall_id, "score" => score} when is_binary(scryfall_id) ->
        [%{scryfall_id: scryfall_id, score: float_score(score)}]

      _match ->
        []
    end)
    |> Enum.sort_by(&{-&1.score, &1.scryfall_id})
  end

  defp normalize_refinement_matches(_matches), do: []

  defp float_score(score) when is_integer(score), do: score * 1.0
  defp float_score(score) when is_float(score), do: score

  defp float_score(score) when is_binary(score) do
    case Float.parse(score) do
      {value, _rest} -> value
      :error -> 0.0
    end
  end

  defp float_score(_score), do: 0.0

  defp apply_image_refinement(
         %ScanItem{} = scan_item,
         scryfall_id,
         score,
         started_at,
         opts
       ) do
    case Repo.transaction(fn ->
           current_item = get_scan_item(scan_item.id)

           with %ScanItem{} = current_item <- current_item,
                :ok <- refinable_scan_item?(current_item),
                false <- current_item.accepted_printing_id == scryfall_id do
             printing = Repo.get!(Printing, scryfall_id)

             {:ok, updated_item} =
               current_item
               |> ScanItem.changeset(%{
                 "accepted_printing_id" => printing.scryfall_id,
                 "finish" => preferred_scan_finish(printing, current_item.finish, opts)
               })
               |> Repo.update()

             {:updated, Repo.preload(updated_item, scan_item_preloads(), force: true)}
           else
             nil -> {:missing, current_item}
             :skip -> {:unchanged, current_item}
             true -> {:unchanged, current_item}
           end
         end) do
      {:ok, {:updated, updated_item}} ->
        log_image_refinement(scan_item, updated_item, score, started_at)
        broadcast_scan_session_update(updated_item)
        {:ok, updated_item}

      {:ok, {:missing, _item}} ->
        {:error, :not_found}

      {:ok, {_status, current_item}} ->
        {:ok, current_item}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp log_image_refinement(scan_item, updated_item, score, started_at) do
    elapsed_us = System.monotonic_time(:microsecond) - started_at

    Logger.info(fn ->
      "OCR image refinement scan_item=#{scan_item.id} " <>
        "printing=#{scan_item.accepted_printing_id}->#{updated_item.accepted_printing_id} " <>
        "score=#{Float.round(score, 3)} image=#{format_us(elapsed_us)}"
    end)
  end

  defp broadcast_scan_session_update(%ScanItem{scan_session_id: scan_session_id})
       when not is_nil(scan_session_id) do
    Phoenix.PubSub.broadcast(
      Manavault.PubSub,
      "scanner_updates:#{scan_session_id}",
      {:scan_session_updated, scan_session_id}
    )
  end

  defp broadcast_scan_session_update(_scan_item), do: :ok

  defp log_capture_timing(started_at, recognition) do
    total_us = System.monotonic_time(:microsecond) - started_at
    timings = Map.get(recognition, :timings, %{})

    Logger.info(fn ->
      "OCR capture timing total=#{format_us(total_us)} " <>
        "ocr=#{format_us(timings[:ocr_us])} " <>
        "title=#{format_us(timings[:title_ocr_us])} " <>
        "full=#{format_us(timings[:full_ocr_us])} " <>
        "parse=#{format_us(timings[:parse_us])} " <>
        "image=#{format_us(timings[:image_us])} " <>
        "match=#{format_us(timings[:match_us])} " <>
        "title_fast_path=#{inspect(timings[:title_ocr_fast_path])}"
    end)
  end

  defp format_us(nil), do: "n/a"
  defp format_us(us), do: "#{Float.round(us / 1_000, 1)}ms"

  defp recognize_capture_image(path, opts) do
    case ScanRecognition.recognize(%ScanItem{image_path: path}, opts) do
      {:ok, %{candidates: [_ | _]} = recognition} ->
        case auto_accept_capture_recognition(recognition) do
          :ok -> {:ok, recognition}
          {:error, reason} -> {:error, reason, path}
        end

      {:ok, %{candidates: []}} ->
        {:error, "No card match found. Keep the card steady in the frame.", path}

      {:error, reason} ->
        {:error, reason, path}
    end
  end

  defp persist_recognized_capture(%ScanSession{} = scan_session, path, recognition, opts) do
    Repo.transaction(fn ->
      {:ok, scan_item} =
        create_scan_item(scan_session, %{
          "image_path" => path,
          "status" => "processing"
        })

      case persist_recognition(scan_item, recognition, opts) do
        {:ok, scan_item} -> scan_item
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  defp persist_recognition(scan_item, recognition, opts \\ [])

  defp persist_recognition(%ScanItem{} = scan_item, %{candidates: [top | _]}, opts) do
    scan_item
    |> ScanItem.changeset(%{
      "status" => "recognized",
      "accepted_printing_id" => top.printing.scryfall_id,
      "finish" => preferred_scan_finish(top.printing, scan_item.finish, opts)
    })
    |> Repo.update()
    |> case do
      {:ok, updated_item} -> {:ok, Repo.preload(updated_item, scan_item_preloads(), force: true)}
      {:error, changeset} -> {:error, changeset}
    end
  end

  defp persist_recognition(%ScanItem{} = scan_item, %{candidates: []}, _opts) do
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

  defp auto_accept_capture_recognition(%{candidates: [top | _rest]}) do
    if top.confidence >= @scan_auto_accept_min_confidence do
      :ok
    else
      {:error, "No card match found with enough confidence. Keep the card steady in the frame."}
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

  defp preferred_scan_finish(%Printing{} = printing, current_finish, opts) do
    if Keyword.get(opts, :prefer_foil, false) and Finishes.supports?(printing, "foil") do
      "foil"
    else
      Finishes.preferred(printing, current_finish)
    end
  end
end
