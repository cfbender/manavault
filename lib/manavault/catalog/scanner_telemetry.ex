defmodule Manavault.Catalog.ScannerTelemetry do
  @moduledoc """
  Lightweight telemetry spans and debug timing logs for the scanner pipeline.
  """

  require Logger

  @prefix [:manavault, :scanner]
  @log_keys [
    :outcome,
    :reason,
    :mode,
    :phase,
    :ocr_crop,
    :scan_session_id,
    :scan_item_id,
    :candidate_count,
    :match_count,
    :confidence,
    :top_image_score,
    :title_ocr_fast_path,
    :art_first,
    :art_first_accepted,
    :accepted_printing_id,
    :card_name,
    :image_path
  ]

  def span(stage, metadata \\ %{}, fun, stop_metadata_fun \\ &default_stop_metadata/1)
      when is_atom(stage) and is_map(metadata) and is_function(fun, 0) and
             is_function(stop_metadata_fun, 1) do
    started_at = System.monotonic_time()
    metadata = Map.put(metadata, :scanner_stage, stage)
    event_prefix = @prefix ++ [stage]

    :telemetry.execute(event_prefix ++ [:start], %{system_time: System.system_time()}, metadata)

    try do
      result = fun.()
      duration = System.monotonic_time() - started_at

      stop_metadata =
        result
        |> safe_stop_metadata(stop_metadata_fun)
        |> Map.put_new(:outcome, infer_outcome(result))

      metadata = Map.merge(metadata, stop_metadata)

      :telemetry.execute(event_prefix ++ [:stop], %{duration: duration}, metadata)
      log_stop(stage, duration, metadata)

      result
    rescue
      exception ->
        stacktrace = __STACKTRACE__
        duration = System.monotonic_time() - started_at

        metadata =
          Map.merge(metadata, %{
            outcome: :exception,
            kind: :error,
            reason: exception,
            stacktrace: stacktrace
          })

        :telemetry.execute(event_prefix ++ [:exception], %{duration: duration}, metadata)
        log_exception(stage, duration, metadata)

        reraise exception, stacktrace
    catch
      kind, reason ->
        stacktrace = __STACKTRACE__
        duration = System.monotonic_time() - started_at

        metadata =
          Map.merge(metadata, %{
            outcome: :exception,
            kind: kind,
            reason: reason,
            stacktrace: stacktrace
          })

        :telemetry.execute(event_prefix ++ [:exception], %{duration: duration}, metadata)
        log_exception(stage, duration, metadata)

        :erlang.raise(kind, reason, stacktrace)
    end
  end

  defp safe_stop_metadata(result, stop_metadata_fun) do
    case stop_metadata_fun.(result) do
      metadata when is_map(metadata) -> metadata
      _other -> %{}
    end
  rescue
    _exception -> %{}
  end

  defp default_stop_metadata({:ok, _result}), do: %{outcome: :ok}
  defp default_stop_metadata({:error, reason}), do: %{outcome: :error, reason: reason}
  defp default_stop_metadata({:error, reason, _path}), do: %{outcome: :error, reason: reason}
  defp default_stop_metadata({:duplicate, _recognition}), do: %{outcome: :duplicate}
  defp default_stop_metadata(:ok), do: %{outcome: :ok}
  defp default_stop_metadata(:error), do: %{outcome: :error}
  defp default_stop_metadata(_result), do: %{outcome: :ok}

  defp infer_outcome({:ok, _result}), do: :ok
  defp infer_outcome({:error, _reason}), do: :error
  defp infer_outcome({:error, _reason, _path}), do: :error
  defp infer_outcome({:duplicate, _recognition}), do: :duplicate
  defp infer_outcome(:ok), do: :ok
  defp infer_outcome(:error), do: :error
  defp infer_outcome(_result), do: :ok

  defp log_stop(stage, duration, metadata) do
    Logger.debug(fn ->
      [
        "Scanner ",
        Atom.to_string(stage),
        " completed in ",
        format_duration(duration),
        format_metadata(metadata)
      ]
    end)
  end

  defp log_exception(stage, duration, metadata) do
    Logger.debug(fn ->
      [
        "Scanner ",
        Atom.to_string(stage),
        " failed in ",
        format_duration(duration),
        format_metadata(metadata)
      ]
    end)
  end

  defp format_duration(duration) do
    duration
    |> System.convert_time_unit(:native, :microsecond)
    |> Kernel./(1_000)
    |> Float.round(1)
    |> then(&"#{&1}ms")
  end

  defp format_metadata(metadata) do
    metadata
    |> Map.take(@log_keys)
    |> Enum.reject(fn {_key, value} -> is_nil(value) or value == "" or value == [] end)
    |> Enum.map(fn {key, value} -> " #{key}=#{format_value(key, value)}" end)
  end

  defp format_value(:image_path, value) when is_binary(value), do: inspect(Path.basename(value))
  defp format_value(_key, value) when is_atom(value), do: Atom.to_string(value)
  defp format_value(_key, value) when is_binary(value), do: inspect(value)
  defp format_value(_key, value), do: inspect(value)
end
