defmodule Manavault.Catalog.Mtgjson.Saltiness do
  @moduledoc false

  alias Manavault.Catalog.Card
  alias Manavault.Repo

  @inflate_chunk_size 64 * 1024
  @update_batch_size 200

  defmodule DecodeError do
    @moduledoc false
    defexception [:message]
  end

  def decode(<<0x1F, 0x8B, _rest::binary>> = body) do
    try do
      case decode_gzip(body) do
        {:ok, value} -> scores_from_value(value)
        {:error, _reason} = error -> error
      end
    rescue
      error in DecodeError -> {:error, error.message}
      error -> {:error, "Could not decode MTGJSON saltiness data: #{Exception.message(error)}"}
    end
  end

  def decode(_body) do
    {:error, "MTGJSON AtomicCards payload was not gzip-compressed JSON"}
  end

  def update_cards(scores) when is_map(scores) do
    Repo.transact(
      fn ->
        Repo.update_all(Card, set: [edhrec_saltiness: nil])

        scores
        |> Enum.chunk_every(@update_batch_size)
        |> Enum.each(&update_card_batch/1)

        {:ok, map_size(scores)}
      end,
      timeout: :infinity
    )
  end

  defp decode_gzip(body) do
    result =
      body
      |> gunzip_chunks()
      |> Enum.reduce({:new, nil}, &decode_json_chunk/2)

    case result do
      {:continued, state} ->
        :json.decode_continue(:end_of_input, state)
        |> complete_decode()

      {:complete, value} ->
        {:ok, value}

      {:new, nil} ->
        {:error, "MTGJSON AtomicCards payload was empty"}
    end
  end

  defp decode_json_chunk(chunk, {:new, nil}) do
    chunk
    |> :json.decode_start(nil, json_decoders())
    |> decode_result()
  end

  defp decode_json_chunk(chunk, {:continued, state}) do
    chunk
    |> :json.decode_continue(state)
    |> decode_result()
  end

  defp decode_json_chunk(chunk, {:complete, value}) do
    if String.trim(chunk) == "" do
      {:complete, value}
    else
      raise DecodeError, "MTGJSON AtomicCards payload included data after the JSON document"
    end
  end

  defp decode_result({:continue, state}), do: {:continued, state}

  defp decode_result(result) do
    case complete_decode(result) do
      {:ok, value} -> {:complete, value}
      {:error, message} -> raise DecodeError, message
    end
  end

  defp complete_decode({value, _acc, rest}) do
    if String.trim(rest) == "" do
      {:ok, value}
    else
      {:error, "MTGJSON AtomicCards payload included data after the JSON document"}
    end
  end

  defp json_decoders do
    %{
      array_start: fn _parent -> [] end,
      array_push: &array_push/2,
      array_finish: fn values, parent -> {{:scores, values}, parent} end,
      object_start: fn _parent -> %{oracle_id: nil, score: nil, scores: []} end,
      object_push: &object_push/3,
      object_finish: &object_finish/2,
      null: nil
    }
  end

  defp array_push({:scores, scores}, acc), do: Enum.reverse(scores, acc)
  defp array_push(_value, acc), do: acc

  defp object_push("scryfallOracleId", oracle_id, acc) when is_binary(oracle_id) do
    %{acc | oracle_id: oracle_id}
  end

  defp object_push("edhrecSaltiness", score, acc) when is_number(score) do
    %{acc | score: score / 1}
  end

  defp object_push("identifiers", {:oracle_id, oracle_id, scores}, acc) do
    %{acc | oracle_id: oracle_id, scores: Enum.reverse(scores, acc.scores)}
  end

  defp object_push(_key, {:oracle_id, _oracle_id, scores}, acc) do
    %{acc | scores: Enum.reverse(scores, acc.scores)}
  end

  defp object_push(_key, {:scores, scores}, acc) do
    %{acc | scores: Enum.reverse(scores, acc.scores)}
  end

  defp object_push(_key, _value, acc), do: acc

  defp object_finish(%{oracle_id: oracle_id, score: score, scores: scores}, parent)
       when is_binary(oracle_id) and is_float(score) do
    {{:scores, [{oracle_id, score} | scores]}, parent}
  end

  defp object_finish(%{oracle_id: oracle_id, scores: scores}, parent)
       when is_binary(oracle_id) do
    {{:oracle_id, oracle_id, scores}, parent}
  end

  defp object_finish(%{scores: scores}, parent), do: {{:scores, scores}, parent}

  defp scores_from_value({:scores, scores}), do: {:ok, Map.new(scores)}
  defp scores_from_value(_value), do: {:error, "MTGJSON AtomicCards payload had no card data"}

  defp update_card_batch(scores) do
    ids = Enum.map(scores, &elem(&1, 0))
    cases = Enum.map_join(scores, " ", fn _ -> "WHEN ? THEN ?" end)
    placeholders = Enum.map_join(ids, ", ", fn _ -> "?" end)
    case_params = Enum.flat_map(scores, fn {oracle_id, score} -> [oracle_id, score] end)

    Repo.query!(
      """
      UPDATE scryfall_cards
      SET edhrec_saltiness = CASE oracle_id #{cases} END
      WHERE oracle_id IN (#{placeholders})
      """,
      case_params ++ ids
    )
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
                message:
                  "Could not decompress MTGJSON AtomicCards payload: #{Exception.message(error)}"
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
        raise DecodeError, "MTGJSON AtomicCards gzip payload was truncated"
    after
      :zlib.close(inflater)
    end
  end
end
