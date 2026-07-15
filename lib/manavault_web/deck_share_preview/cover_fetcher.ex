defmodule ManavaultWeb.DeckSharePreview.CoverFetcher do
  @moduledoc false

  @allowed_hosts MapSet.new(["cards.scryfall.io", "img.scryfall.com"])
  @allowed_mime_types MapSet.new([
                        "image/avif",
                        "image/gif",
                        "image/jpeg",
                        "image/png",
                        "image/svg+xml",
                        "image/webp"
                      ])
  @default_connect_timeout 1_500
  @default_read_timeout 1_500
  @default_receive_timeout 1_500
  @default_max_bytes 5_000_000
  @bytes_key {__MODULE__, :bytes}
  @chunks_key {__MODULE__, :chunks}
  @too_large_key {__MODULE__, :too_large}

  def prepare(url, opts \\ [])

  def prepare("data:" <> _rest = url, opts) do
    if data_image_url?(url) and byte_size(url) <= max_bytes(opts), do: url, else: nil
  end

  def prepare(url, opts) when is_binary(url) do
    if allowed_remote_url?(url) do
      fetcher = Keyword.get(opts, :fetcher, &fetch/2)

      case fetcher.(url, opts) do
        {:ok, response} -> response_to_data_url(response, max_bytes(opts))
        {:error, _reason} -> nil
      end
    end
  end

  def prepare(_url, _opts), do: nil

  def fetch(url, opts \\ []) when is_binary(url) do
    max_bytes = max_bytes(opts)
    read_timeout = timeout(opts, :read_timeout, @default_read_timeout)
    receive_timeout = min(read_timeout, timeout(opts, :receive_timeout, @default_receive_timeout))

    case Req.get(url,
           headers: [{"accept", "image/avif,image/gif,image/jpeg,image/png,image/svg+xml,image/webp"}],
           connect_options: [timeout: timeout(opts, :connect_timeout, @default_connect_timeout)],
           receive_timeout: receive_timeout,
           redirect: false,
           into: streaming_body(max_bytes)
         ) do
      {:ok, response} -> streamed_response(response)
      {:error, reason} -> {:error, reason}
    end
  end

  def allowed_mime_type?(content_type) when is_binary(content_type) do
    content_type
    |> String.split(";", parts: 2)
    |> List.first()
    |> String.trim()
    |> String.downcase()
    |> then(&MapSet.member?(@allowed_mime_types, &1))
  end

  def allowed_mime_type?(_content_type), do: false

  defp response_to_data_url(%{status: status, headers: headers, body: body}, max_bytes)
       when status in 200..299 and is_binary(body) do
    content_type = response_content_type(headers)

    if body_within_limit?(headers, body, max_bytes) and allowed_mime_type?(content_type) do
      "data:#{content_type};base64,#{Base.encode64(body)}"
    end
  end

  defp response_to_data_url(_response, _max_bytes), do: nil

  defp streamed_response(response) do
    private = Map.get(response, :private, %{})

    if Map.get(private, @too_large_key, false) do
      {:error, :body_too_large}
    else
      {:ok,
       %{
         status: Map.fetch!(response, :status),
         headers: Map.fetch!(response, :headers),
         body: private |> Map.get(@chunks_key, []) |> Enum.reverse() |> IO.iodata_to_binary()
       }}
    end
  end

  defp streaming_body(max_bytes) do
    fn {:data, data}, {request, response} ->
      private = Map.get(response, :private, %{})
      chunks = Map.get(private, @chunks_key, [])
      received_bytes = Map.get(private, @bytes_key, 0) + byte_size(data)

      private =
        private
        |> Map.put(@bytes_key, received_bytes)
        |> Map.put(@chunks_key, [data | chunks])
        |> Map.put(@too_large_key, declared_or_streamed_size_exceeded?(response.headers, received_bytes, max_bytes))

      response = Map.put(response, :private, private)

      if Map.fetch!(private, @too_large_key) do
        {:halt, {request, response}}
      else
        {:cont, {request, response}}
      end
    end
  end

  defp body_within_limit?(headers, body, max_bytes) do
    byte_size(body) <= max_bytes and
      case content_length(headers) do
        nil -> true
        length -> length <= max_bytes
      end
  end

  defp declared_or_streamed_size_exceeded?(headers, received_bytes, max_bytes) do
    received_bytes > max_bytes or
      case content_length(headers) do
        nil -> false
        length -> length > max_bytes
      end
  end

  defp data_image_url?(url) do
    case String.split(url, ",", parts: 2) do
      [metadata, _encoded_body] ->
        metadata
        |> String.replace_prefix("data:", "")
        |> allowed_mime_type?()

      _parts ->
        false
    end
  end

  defp allowed_remote_url?(url) do
    case URI.parse(url) do
      %URI{scheme: "https", host: host} when is_binary(host) ->
        MapSet.member?(@allowed_hosts, String.downcase(host))

      _uri ->
        false
    end
  end

  defp response_content_type(headers) do
    headers
    |> header("content-type")
    |> List.first()
    |> normalize_content_type()
  end

  defp content_length(headers) do
    case headers |> header("content-length") |> List.first() do
      nil -> nil
      value -> parse_nonnegative_integer(value)
    end
  end

  defp header(headers, name) when is_map(headers) do
    headers
    |> Map.get(name, [])
    |> List.wrap()
  end

  defp header(headers, name) when is_list(headers) do
    headers
    |> Enum.find_value([], fn
      {^name, value} -> List.wrap(value)
      _header -> nil
    end)
  end

  defp header(_headers, _name), do: []

  defp normalize_content_type(nil), do: nil

  defp normalize_content_type(value) do
    value
    |> to_string()
    |> String.split(";", parts: 2)
    |> List.first()
    |> String.trim()
    |> String.downcase()
  end

  defp parse_nonnegative_integer(value) do
    case Integer.parse(to_string(value)) do
      {length, ""} when length >= 0 -> length
      _value -> nil
    end
  end

  defp timeout(opts, key, default) do
    case Keyword.get(opts, key, default) do
      value when is_integer(value) and value > 0 -> value
      _value -> default
    end
  end

  defp max_bytes(opts) do
    case Keyword.get(opts, :max_bytes, @default_max_bytes) do
      bytes when is_integer(bytes) and bytes > 0 -> bytes
      _bytes -> @default_max_bytes
    end
  end
end
