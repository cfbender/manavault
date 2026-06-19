defmodule ManavaultWeb.ScanCapture do
  alias Manavault.Catalog
  alias Manavault.Catalog.{Printing, ScanItem, ScanSession}
  alias Manavault.Catalog.Price

  def capture(%{"scan_session_id" => scan_session_id, "image_data" => image_data} = args)
      when is_binary(image_data) do
    scan_session = Catalog.get_scan_session!(scan_session_id)

    case Catalog.create_recognized_scan_item_from_capture(
           scan_session,
           image_data,
           scan_recognition_opts(args)
         ) do
      {:ok, scan_item} ->
        scan_item = Catalog.get_scan_item!(scan_item.id)
        oracle_id = scan_item_oracle_id(scan_item)

        if !truthy?(Map.get(args, "force", false)) && oracle_id &&
             oracle_id == Map.get(args, "last_oracle_id") do
          {:ok, _deleted} = Catalog.delete_scan_item(scan_item)

          {:ok,
           %{
             outcome: "duplicate",
             message: "Tap to add another copy.",
             scan_item: nil,
             scan_session: Catalog.get_scan_session!(scan_session.id)
           }}
        else
          {:ok,
           %{
             outcome: "accepted",
             message: "Recognized card ##{scan_item.id}. Keep scanning.",
             scan_item: scan_item,
             scan_session: Catalog.get_scan_session!(scan_session.id)
           }}
        end

      {:error, "No card match found" <> _rest} ->
        rejected_capture_result(scan_session)

      {:error, "argument error"} ->
        rejected_capture_result(scan_session)

      {:error, reason} when is_binary(reason) ->
        {:ok,
         %{
           outcome: "error",
           message: reason,
           scan_item: nil,
           scan_session: Catalog.get_scan_session!(scan_session.id)
         }}

      {:error, changeset} when is_struct(changeset, Ecto.Changeset) ->
        {:error, changeset_error_message(changeset)}
    end
  end

  def capture(_args), do: {:error, "Invalid scanner payload."}

  def to_client_map(%{} = result) do
    %{
      "outcome" => result.outcome,
      "message" => result.message,
      "scanItem" => scan_item_map(result.scan_item),
      "scanSession" => scan_session_map(result.scan_session)
    }
  end

  defp scan_recognition_opts(args) do
    []
    |> maybe_put_scan_opt(:prefer_foil, truthy?(Map.get(args, "prefer_foil", false)))
    |> maybe_put_scan_opt(:set_codes, Map.get(args, "set_codes", []))
  end

  defp maybe_put_scan_opt(opts, _key, false), do: opts
  defp maybe_put_scan_opt(opts, _key, []), do: opts
  defp maybe_put_scan_opt(opts, key, value), do: Keyword.put(opts, key, value)

  defp rejected_capture_result(%ScanSession{} = session) do
    {:ok,
     %{
       outcome: "rejected",
       message: "Keep scanning.",
       scan_item: nil,
       scan_session: Catalog.get_scan_session!(session.id)
     }}
  end

  defp scan_session_map(%ScanSession{} = session) do
    %{
      "id" => to_string(session.id),
      "name" => session.name,
      "defaultCondition" => session.default_condition,
      "defaultLanguage" => session.default_language,
      "defaultFinish" => session.default_finish,
      "defaultLocation" => location_map(session.default_location),
      "itemCount" => length(session.scan_items || []),
      "reviewCount" => Enum.count(session.scan_items || [], &(&1.status == "needs_review")),
      "createdAt" => serialize_time(session.inserted_at),
      "scanItems" =>
        session
        |> Map.get(:scan_items, [])
        |> Enum.sort_by(& &1.id, :desc)
        |> Enum.map(&scan_item_map/1)
    }
  end

  defp scan_item_map(nil), do: nil

  defp scan_item_map(%ScanItem{} = item) do
    %{
      "id" => to_string(item.id),
      "status" => item.status,
      "quantity" => item.quantity,
      "condition" => item.condition,
      "language" => item.language,
      "finish" => item.finish,
      "acceptedPrintingId" => item.accepted_printing_id,
      "insertedAt" => serialize_time(item.inserted_at),
      "acceptedPrinting" => printing_map(item.accepted_printing),
      "location" => location_map(item.location)
    }
  end

  defp printing_map(nil), do: nil

  defp printing_map(%Printing{} = printing) do
    %{
      "scryfallId" => printing.scryfall_id,
      "oracleId" => printing.oracle_id,
      "setCode" => printing.set_code,
      "setName" => printing.set_name,
      "collectorNumber" => printing.collector_number,
      "rarity" => printing.rarity,
      "imageUrl" => image_url(decode_json(printing.image_uris, %{})),
      "priceText" => Price.text_for_printing(printing),
      "card" => card_map(printing.card)
    }
  end

  defp card_map(nil), do: nil

  defp card_map(card) do
    %{
      "oracleId" => card.oracle_id,
      "name" => card.name,
      "typeLine" => card.type_line
    }
  end

  defp location_map(nil), do: nil

  defp location_map(location) do
    %{
      "id" => to_string(location.id),
      "name" => location.name
    }
  end

  defp scan_item_oracle_id(%ScanItem{accepted_printing: %{oracle_id: oracle_id}})
       when is_binary(oracle_id),
       do: oracle_id

  defp scan_item_oracle_id(%ScanItem{accepted_printing: %{card: %{oracle_id: oracle_id}}})
       when is_binary(oracle_id),
       do: oracle_id

  defp scan_item_oracle_id(_scan_item), do: nil

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

  defp serialize_time(nil), do: nil
  defp serialize_time(time), do: NaiveDateTime.to_iso8601(time)

  defp truthy?(true), do: true
  defp truthy?("true"), do: true
  defp truthy?(_value), do: false

  defp changeset_error_message(%Ecto.Changeset{} = changeset) do
    changeset
    |> Ecto.Changeset.traverse_errors(fn {message, opts} ->
      Enum.reduce(opts, message, fn {key, value}, acc ->
        String.replace(acc, "%{#{key}}", to_string(value))
      end)
    end)
    |> Enum.map_join(", ", fn {field, messages} -> "#{field} #{Enum.join(messages, ", ")}" end)
  end
end
