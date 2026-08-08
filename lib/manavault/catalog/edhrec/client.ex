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

  def fetch_commander_page(name_or_names, theme_slug \\ nil)
      when is_binary(name_or_names) or is_list(name_or_names) do
    path =
      [commander_slug(name_or_names), theme_slug && card_slug(theme_slug)]
      |> Enum.reject(&(&1 in [nil, ""]))
      |> Enum.join("/")

    get_commander_page("#{@commander_page_base_url}/#{path}.json", _follow_redirect? = true)
  end

  defp get_commander_page(url, follow_redirect?) do
    case Req.get(url, headers: [{"accept", "application/json"}], receive_timeout: 20_000) do
      {:ok, %{status: status, body: body}} when status in 200..299 ->
        with {:ok, page} <- decode_response_body(body) do
          follow_commander_redirect(page, follow_redirect?)
        end

      {:ok, %{status: status}} ->
        {:error, {:edhrec_commander_http_error, status}}

      {:error, exception} ->
        {:error, {:edhrec_commander_request_failed, Exception.message(exception)}}
    end
  end

  # EDHREC answers non-canonical commander slugs (e.g. a partner pair in the
  # wrong order) with a JSON body of {"redirect": "/commanders/<slug>"}.
  defp follow_commander_redirect(%{"redirect" => "/commanders/" <> slug}, true)
       when is_binary(slug) and slug != "" do
    get_commander_page("#{@commander_page_base_url}/#{slug}.json", false)
  end

  defp follow_commander_redirect(%{"redirect" => _path}, _follow_redirect?),
    do: {:error, :edhrec_unexpected_response}

  defp follow_commander_redirect(page, _follow_redirect?), do: {:ok, page}

  # Partner commander pages live at both slugs joined in alphabetical order.
  def commander_slug(names) when is_list(names) do
    names
    |> Enum.map(&card_slug/1)
    |> Enum.sort()
    |> Enum.join("-")
  end

  def commander_slug(name) when is_binary(name), do: card_slug(name)

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
