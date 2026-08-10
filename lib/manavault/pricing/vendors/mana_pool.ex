defmodule Manavault.Pricing.Vendors.ManaPool do
  @moduledoc """
  ManaPool's public singles price feed. One request returns every single with
  its Scryfall ID and lowest listing price in cents per finish.
  """

  @prices_url "https://manapool.com/api/v1/prices/singles"

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

  def rows(%{"data" => singles}) when is_list(singles) do
    Enum.flat_map(singles, &single_rows/1)
  end

  def rows(_body), do: []

  @finish_fields [
    {"nonfoil", "price_cents"},
    {"foil", "price_cents_foil"},
    {"etched", "price_cents_etched"}
  ]

  defp single_rows(%{"scryfall_id" => scryfall_id} = single)
       when is_binary(scryfall_id) and scryfall_id != "" do
    for {finish, field} <- @finish_fields,
        cents = single[field],
        is_integer(cents) and cents > 0 do
      %{scryfall_id: scryfall_id, finish: finish, price_cents: cents}
    end
  end

  defp single_rows(_single), do: []
end
