defmodule Manavault.Catalog.EDHRec.Client do
  @moduledoc false

  @recs_url "https://edhrec.com/api/recs"
  @commander_page_base_url "https://json.edhrec.com/pages/commanders"
  @headers [
    {"accept", "application/json"},
    {"content-type", "application/json"},
    {"origin", "https://edhrec.com"},
    {"referer", "https://edhrec.com/recs"},
    {"user-agent",
     "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ManaVault/0.1"}
  ]

  def fetch_recs(payload) when is_map(payload) do
    case Req.post(@recs_url, json: payload, headers: @headers, receive_timeout: 20_000) do
      {:ok, %{status: status, body: body}} when status in 200..299 ->
        decode_response_body(body)

      {:ok, %{status: status}} ->
        {:error, {:edhrec_http_error, status}}

      {:error, exception} ->
        {:error, {:edhrec_request_failed, Exception.message(exception)}}
    end
  end

  def fetch_commander_page(name) when is_binary(name) do
    url = "#{@commander_page_base_url}/#{card_slug(name)}.json"

    case Req.get(url, headers: [{"accept", "application/json"}], receive_timeout: 20_000) do
      {:ok, %{status: status, body: body}} when status in 200..299 ->
        decode_response_body(body)

      {:ok, %{status: status}} ->
        {:error, {:edhrec_commander_http_error, status}}

      {:error, exception} ->
        {:error, {:edhrec_commander_request_failed, Exception.message(exception)}}
    end
  end

  defp decode_response_body(body) when is_map(body), do: {:ok, body}

  defp decode_response_body(body) when is_binary(body) do
    case Jason.decode(body) do
      {:ok, decoded} when is_map(decoded) -> {:ok, decoded}
      {:ok, _decoded} -> {:error, :edhrec_unexpected_response}
      {:error, _error} -> {:error, :edhrec_unexpected_response}
    end
  end

  defp decode_response_body(_body), do: {:error, :edhrec_unexpected_response}

  defp card_slug(name) do
    name
    |> String.downcase()
    |> String.replace(~r/['’,]/u, "")
    |> String.replace(~r/[^a-z0-9]+/u, "-")
    |> String.trim("-")
  end
end
