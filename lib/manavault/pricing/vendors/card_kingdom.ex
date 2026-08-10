defmodule Manavault.Pricing.Vendors.CardKingdom do
  @moduledoc """
  Card Kingdom's official singles pricelist. One request returns every single
  with its Scryfall ID, NM retail price, and foil flag; etched printings are
  flagged through the variation text.
  """

  alias Manavault.Pricing.Money

  @pricelist_url "https://api.cardkingdom.com/api/v2/pricelist"

  def vendor, do: "cardkingdom"

  def sync_interval, do: :timer.hours(6)

  def fetch(req_options \\ []) do
    options =
      Keyword.merge(
        [url: @pricelist_url, receive_timeout: :timer.minutes(5)],
        req_options
      )

    case Req.get(options) do
      {:ok, %Req.Response{status: 200, body: body}} -> {:ok, rows(body)}
      {:ok, %Req.Response{status: status}} -> {:error, "Card Kingdom returned HTTP #{status}"}
      {:error, exception} -> {:error, Exception.message(exception)}
    end
  end

  def rows(%{"data" => products}) when is_list(products) do
    Enum.flat_map(products, &product_rows/1)
  end

  # Card Kingdom serves the JSON pricelist with a text/html content type, so
  # Req leaves the body as a binary instead of decoding it.
  def rows(body) when is_binary(body) do
    case Jason.decode(body) do
      {:ok, decoded} -> rows(decoded)
      {:error, _reason} -> []
    end
  end

  def rows(_body), do: []

  defp product_rows(%{"scryfall_id" => scryfall_id} = product)
       when is_binary(scryfall_id) and scryfall_id != "" do
    case Money.to_cents(product["price_retail"]) do
      nil ->
        []

      cents ->
        [%{scryfall_id: scryfall_id, finish: finish(product), price_cents: cents}]
    end
  end

  defp product_rows(_product), do: []

  defp finish(product) do
    variation = product |> Map.get("variation", "") |> to_string() |> String.downcase()

    cond do
      String.contains?(variation, "etched") -> "etched"
      foil?(product) -> "foil"
      true -> "nonfoil"
    end
  end

  defp foil?(%{"is_foil" => is_foil}), do: is_foil in [true, "true"]
  defp foil?(_product), do: false
end
