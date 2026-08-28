defmodule Manavault.Catalog.Recommander.Client do
  @moduledoc false

  @recommend_url "https://api.recommander.cards/public-release/api/decks/recommend/top"
  @headers [
    {"accept", "application/json"},
    {"content-type", "application/json"},
    {"user-agent", "ManaVault/0.1 (+https://github.com/cfbender/manavault)"}
  ]

  def fetch_recommendations(payload) when is_map(payload) do
    case Req.post(@recommend_url, json: payload, headers: @headers, receive_timeout: 30_000) do
      {:ok, %{status: 429}} ->
        {:error, {:recommander_api_error, "error_rate_limited", []}}

      {:ok, %{status: status, body: body}} when status in 200..299 ->
        with {:ok, envelope} <- decode_response_body(body) do
          unwrap_envelope(envelope)
        end

      {:ok, %{status: status, body: body}} ->
        # Recommander wraps some failures in the standard envelope even on
        # non-2xx statuses; prefer its result_code over a bare HTTP error.
        case decode_response_body(body) do
          {:ok, %{"result_code" => code} = envelope} when is_binary(code) and code != "success" ->
            unwrap_envelope(envelope)

          _other ->
            {:error, {:recommander_http_error, status}}
        end

      {:error, exception} ->
        {:error, {:recommander_request_failed, Exception.message(exception)}}
    end
  end

  defp unwrap_envelope(%{"result_code" => "success"} = envelope) do
    case get_in(envelope, ["data", "recommendations"]) do
      recommendations when is_list(recommendations) -> {:ok, recommendations}
      nil -> {:ok, []}
      _other -> {:error, :recommander_unexpected_response}
    end
  end

  defp unwrap_envelope(%{"result_code" => code} = envelope) when is_binary(code) do
    {:error, {:recommander_api_error, code, error_messages(envelope)}}
  end

  defp unwrap_envelope(_envelope), do: {:error, :recommander_unexpected_response}

  defp error_messages(%{"error" => %{"messages" => messages}}) when is_list(messages) do
    Enum.filter(messages, &is_binary/1)
  end

  defp error_messages(_envelope), do: []

  defp decode_response_body(body) when is_map(body), do: {:ok, body}

  defp decode_response_body(body) when is_binary(body) do
    case Jason.decode(body) do
      {:ok, decoded} when is_map(decoded) -> {:ok, decoded}
      {:ok, _decoded} -> {:error, :recommander_unexpected_response}
      {:error, _error} -> {:error, :recommander_unexpected_response}
    end
  end

  defp decode_response_body(_body), do: {:error, :recommander_unexpected_response}
end
