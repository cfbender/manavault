defmodule Manavault.Catalog.Scryfall.BulkData do
  @moduledoc false

  @inflate_chunk_size 64 * 1024

  defmodule DecodeError do
    @moduledoc false
    defexception [:message]
  end

  def download_uri(%{"jsonl_download_uri" => uri}) when is_binary(uri), do: {:ok, uri}

  def download_uri(_metadata) do
    {:error, "Scryfall bulk metadata did not include jsonl_download_uri"}
  end

  def decode(<<0x1F, 0x8B, _rest::binary>> = body) do
    with {:ok, source_count} <- validate(body) do
      {:ok, jsonl_gzip_stream(body), source_count}
    end
  end

  def decode(_body) do
    {:error, "Scryfall bulk payload was not gzip-compressed JSON Lines"}
  end

  def decode_list(<<0x1F, 0x8B, _rest::binary>> = body) do
    try do
      {:ok, Enum.to_list(jsonl_gzip_stream(body))}
    rescue
      error in DecodeError -> {:error, error.message}
    end
  end

  def decode_list(_body) do
    {:error, "Scryfall bulk payload was not gzip-compressed JSON Lines"}
  end

  defp validate(body) do
    try do
      {:ok, Enum.count(jsonl_gzip_stream(body))}
    rescue
      error in DecodeError -> {:error, error.message}
    end
  end

  defp jsonl_gzip_stream(body) do
    body
    |> gunzip_chunks()
    |> Stream.concat([:eof])
    |> Stream.transform("", &decode_chunk/2)
  end

  defp gunzip_chunks(body) do
    Stream.resource(
      fn -> open_inflater() end,
      fn
        {inflater, offset} when offset < byte_size(body) ->
          chunk_size = min(@inflate_chunk_size, byte_size(body) - offset)
          chunk = binary_part(body, offset, chunk_size)
          output = inflate(inflater, chunk)
          {[IO.iodata_to_binary(output)], {inflater, offset + chunk_size}}

        state ->
          {:halt, state}
      end,
      fn {inflater, offset} -> close_inflater(inflater, offset == byte_size(body)) end
    )
  end

  defp open_inflater do
    inflater = :zlib.open()
    :ok = :zlib.inflateInit(inflater, 31)
    {inflater, 0}
  end

  defp inflate(inflater, chunk) do
    :zlib.inflate(inflater, chunk)
  rescue
    error ->
      reraise DecodeError,
              [
                message: "Could not decompress Scryfall bulk payload: #{Exception.message(error)}"
              ],
              __STACKTRACE__
  end

  defp close_inflater(inflater, fully_consumed?) do
    try do
      :zlib.inflateEnd(inflater)
    catch
      :error, :data_error when not fully_consumed? ->
        :ok

      :error, :data_error ->
        raise DecodeError, "Scryfall gzip bulk payload was truncated"
    after
      :zlib.close(inflater)
    end
  end

  defp decode_chunk(:eof, carry), do: {decode_lines([carry]), ""}

  defp decode_chunk(chunk, carry) do
    parts = :binary.split(carry <> chunk, "\n", [:global])
    {decode_lines(Enum.drop(parts, -1)), List.last(parts)}
  end

  defp decode_lines(lines) do
    Enum.flat_map(lines, fn line ->
      case String.trim_trailing(line, "\r") do
        "" ->
          []

        json ->
          case Jason.decode(json) do
            {:ok, record} when is_map(record) ->
              [record]

            {:ok, _value} ->
              raise DecodeError, "Scryfall JSON Lines record was not an object"

            {:error, reason} ->
              raise DecodeError, "Invalid Scryfall JSON Lines record: #{inspect(reason)}"
          end
      end
    end)
  end
end
