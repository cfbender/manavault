defmodule Manavault.Pricing.Vendors.ManaPool do
  @moduledoc """
  ManaPool's public singles price feed. Uses its market prices for nonfoil and
  foil printings. ManaPool does not currently publish an etched market price.
  """

  @prices_url "https://manapool.com/api/v1/prices/singles"

  @market_prices %{"price_market" => "nonfoil", "price_market_foil" => "foil"}

  def vendor, do: "manapool"

  def sync_interval, do: :timer.hours(6)

  def fetch(req_options \\ []) do
    options =
      Keyword.merge(
        [url: @prices_url, receive_timeout: :timer.minutes(5)],
        req_options
      )

    case Req.get(options) do
      {:ok, %Req.Response{status: 200, body: body}} -> {:ok, rows(body)}
      {:ok, %Req.Response{status: status}} -> {:error, "ManaPool returned HTTP #{status}"}
      {:error, exception} -> {:error, Exception.message(exception)}
    end
  end

  def rows(%{"data" => variants}) when is_list(variants) do
    Enum.flat_map(variants, fn variant ->
      for {field, finish} <- @market_prices,
          %{"scryfall_id" => scryfall_id, ^field => price_cents} <- [variant],
          is_binary(scryfall_id) and scryfall_id != "",
          is_integer(price_cents) and price_cents > 0 do
        %{scryfall_id: scryfall_id, finish: finish, price_cents: price_cents}
      end
    end)
  end

  def rows(_body), do: []
end
