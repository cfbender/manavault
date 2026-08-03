defmodule Manavault.Trade.ListSource.Http do
  @moduledoc """
  Hardened Req plumbing shared by the trade list URL providers
  (`Manavault.Trade.ListSource.Moxfield`, `.Archidekt`,
  `.ManaVaultRemote`). Callers pass a fully built URL — either a hardcoded
  origin plus a validated id, or (for cross-instance ManaVault links) a
  user-supplied `scheme://host:port` origin whose path is always forced to
  `/share/graphql`. The guarantees this module keeps regardless of caller:
  no redirects are followed, requests carry no auth or cookies, and both
  timeouts and response size are bounded.
  """

  @default_connect_timeout 10_000
  @default_receive_timeout 10_000
  @default_max_bytes 5_000_000
  @bytes_key {__MODULE__, :bytes}
  @chunks_key {__MODULE__, :chunks}
  @too_large_key {__MODULE__, :too_large}

  @doc """
  GETs `url` and decodes a JSON body, enforcing connect/receive timeouts and
  a response size cap. Returns `{:ok, decoded}` or `{:error, reason}` where
  `reason` is one of `:forbidden`, `:timeout`, `:body_too_large`,
  `:invalid_json`, `{:http_error, status}`, or `:request_failed`.
  """
  def get_json(url, opts \\ []) when is_binary(url) do
    url
    |> Req.get(request_options(opts))
    |> handle_response()
  end

  @doc """
  POSTs `body` as JSON to `url` and decodes the JSON response, enforcing the
  same timeouts and response size cap as `get_json/2`. Returns `{:ok,
  decoded}` or `{:error, reason}` with the same reason shapes as
  `get_json/2`.
  """
  def post_json(url, body, opts \\ []) when is_binary(url) do
    request_options = Keyword.put(request_options(opts), :json, body)

    url
    |> Req.post(request_options)
    |> handle_response()
  end

  @doc """
  POSTs and decodes JSON like `post_json/3`, returning the downloaded body
  size as the third tuple element on success.
  """
  def post_json_with_size(url, body, opts \\ []) when is_binary(url) do
    request_options = Keyword.put(request_options(opts), :json, body)

    url
    |> Req.post(request_options)
    |> handle_response(true)
  end

  defp request_options(opts) do
    max_bytes = Keyword.get(opts, :max_bytes, @default_max_bytes)

    [
      headers: [
        {"accept", "application/json"},
        {"user-agent", "ManaVault/0.1 (+trade-list-import)"}
      ],
      connect_options: [
        timeout: Keyword.get(opts, :connect_timeout, @default_connect_timeout)
      ],
      receive_timeout: Keyword.get(opts, :receive_timeout, @default_receive_timeout),
      redirect: false,
      into: streaming_body(max_bytes)
    ] ++ Keyword.get(opts, :req_options, [])
  end

  defp handle_response(result, include_size? \\ false)

  defp handle_response({:ok, response}, include_size?) do
    case streamed_body(response) do
      {:ok, body} -> decode_status(response.status, body, include_size?)
      {:error, reason} -> {:error, reason}
    end
  end

  defp handle_response({:error, %{reason: :timeout}}, _include_size?), do: {:error, :timeout}
  defp handle_response({:error, _exception}, _include_size?), do: {:error, :request_failed}

  defp decode_status(status, body, include_size?) when status in 200..299 do
    case Jason.decode(body) do
      {:ok, decoded} when include_size? -> {:ok, decoded, byte_size(body)}
      {:ok, decoded} -> {:ok, decoded}
      {:error, _reason} -> {:error, :invalid_json}
    end
  end

  defp decode_status(403, _body, _include_size?), do: {:error, :forbidden}
  defp decode_status(status, _body, _include_size?), do: {:error, {:http_error, status}}

  defp streamed_body(response) do
    private = Map.get(response, :private, %{})

    if Map.get(private, @too_large_key, false) do
      {:error, :body_too_large}
    else
      {:ok, private |> Map.get(@chunks_key, []) |> Enum.reverse() |> IO.iodata_to_binary()}
    end
  end

  # Halts the download as soon as the cap is exceeded instead of trusting a
  # (spoofable) content-length header.
  defp streaming_body(max_bytes) do
    fn {:data, data}, {request, response} ->
      private = Map.get(response, :private, %{})
      chunks = Map.get(private, @chunks_key, [])
      received_bytes = Map.get(private, @bytes_key, 0) + byte_size(data)
      too_large? = received_bytes > max_bytes

      private =
        private
        |> Map.put(@bytes_key, received_bytes)
        |> Map.put(@chunks_key, [data | chunks])
        |> Map.put(@too_large_key, too_large?)

      response = Map.put(response, :private, private)

      if too_large?, do: {:halt, {request, response}}, else: {:cont, {request, response}}
    end
  end
end
