defmodule Manavault.Catalog.Vendors.StarCityGames do
  @moduledoc false

  @affiliate_url "https://ajax.starcitygames.com/affiliate"
  @deck_builder_url "https://starcitygames.com/shop/deck-builder/"
  @uuid_pattern ~r/\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/i

  def create_deck_builder_url(decklist) when is_binary(decklist) do
    if String.trim(decklist) == "" do
      {:error, :empty_decklist}
    else
      request_deck_builder_url(decklist)
    end
  end

  defp request_deck_builder_url(decklist) do
    options =
      Keyword.merge(
        [
          headers: [
            {"accept", "application/json"},
            {"user-agent", "ManaVault/0.1 (+https://github.com/cfbender/manavault)"}
          ],
          receive_timeout: 15_000,
          retry: false
        ],
        Application.get_env(:manavault, :star_city_games_req_options, [])
      )

    case Req.post(@affiliate_url, Keyword.put(options, :json, %{data: decklist})) do
      {:ok, %{status: status, body: %{"affiliateDataID" => id}}}
      when status in 200..299 and is_binary(id) ->
        deck_builder_url(id)

      {:ok, %{status: status}} when status not in 200..299 ->
        {:error, {:http_status, status}}

      {:ok, _response} ->
        {:error, :invalid_response}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp deck_builder_url(id) do
    if Regex.match?(@uuid_pattern, id) do
      {:ok, "#{@deck_builder_url}?data=#{id}"}
    else
      {:error, :invalid_response}
    end
  end
end
