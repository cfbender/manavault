defmodule Manavault.Pricing.Vendors.ManaPool do
  @moduledoc """
  ManaPool's public variant price feed. For each card and finish, prices prefer
  the best available condition in NM, LP, MP, HP, then DMG order.
  """

  @prices_url "https://manapool.com/api/v1/prices/variants"

  @condition_priority %{"NM" => 0, "LP" => 1, "MP" => 2, "HP" => 3, "DMG" => 4}
  @finishes %{"NF" => "nonfoil", "FO" => "foil", "EF" => "etched"}

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
    variants
    |> Enum.reduce(%{}, &keep_preferred_price/2)
    |> Enum.map(fn {{scryfall_id, finish}, {_priority, price_cents}} ->
      %{scryfall_id: scryfall_id, finish: finish, price_cents: price_cents}
    end)
  end

  def rows(_body), do: []

  defp keep_preferred_price(
         %{
           "scryfall_id" => scryfall_id,
           "finish_id" => finish_id,
           "condition_id" => condition_id,
           "low_price" => price_cents,
           "available_quantity" => available_quantity
         },
         prices
       )
       when is_binary(scryfall_id) and scryfall_id != "" and is_integer(price_cents) and
              price_cents > 0 and is_number(available_quantity) and available_quantity > 0 do
    with {:ok, finish} <- Map.fetch(@finishes, finish_id),
         {:ok, priority} <- Map.fetch(@condition_priority, condition_id) do
      Map.update(
        prices,
        {scryfall_id, finish},
        {priority, price_cents},
        &min(&1, {priority, price_cents})
      )
    else
      :error -> prices
    end
  end

  defp keep_preferred_price(_variant, prices), do: prices
end
