defmodule Manavault.Pricing.Vendors.ManaPool do
  @moduledoc """
  ManaPool's public singles price feed. Uses its market prices for nonfoil and
  foil printings. ManaPool's market fields can combine distinct special
  treatments, so those printings use their treatment-specific listing prices.
  Etched printings also use listing prices because ManaPool does not publish an
  etched market field.
  """

  import Ecto.Query

  alias Manavault.Catalog.Printing
  alias Manavault.Repo

  @prices_url "https://manapool.com/api/v1/prices/singles"

  @market_prices [
    {"nonfoil", ["price_market"]},
    {"foil", ["price_market_foil"]},
    {"etched", ["price_cents_nm_etched", "price_cents_lp_plus_etched", "price_cents_etched"]}
  ]

  @listing_prices [
    {"nonfoil", ["price_cents_nm", "price_cents_lp_plus", "price_cents"]},
    {"foil", ["price_cents_nm_foil", "price_cents_lp_plus_foil", "price_cents_foil"]},
    {"etched", ["price_cents_nm_etched", "price_cents_lp_plus_etched", "price_cents_etched"]}
  ]

  @named_special_treatments ~w(gilded invisibleink neonink oilslick serialized stepandcompleat textured)

  def vendor, do: "manapool"

  def sync_interval, do: :timer.hours(6)

  def fetch(req_options \\ []) do
    options =
      Keyword.merge(
        [url: @prices_url, receive_timeout: :timer.minutes(5)],
        req_options
      )

    case Req.get(options) do
      {:ok, %Req.Response{status: 200, body: body}} ->
        {:ok, rows(body, special_treatment_ids())}

      {:ok, %Req.Response{status: status}} ->
        {:error, "ManaPool returned HTTP #{status}"}

      {:error, exception} ->
        {:error, Exception.message(exception)}
    end
  end

  def rows(body, special_treatment_ids \\ MapSet.new())

  def rows(%{"data" => variants}, %MapSet{} = special_treatment_ids) when is_list(variants) do
    Enum.flat_map(variants, fn variant ->
      with %{"scryfall_id" => scryfall_id} when is_binary(scryfall_id) and scryfall_id != "" <-
             variant do
        price_fields =
          if MapSet.member?(special_treatment_ids, scryfall_id),
            do: @listing_prices,
            else: @market_prices

        for {finish, fields} <- price_fields,
            price_cents = first_price(variant, fields),
            not is_nil(price_cents) do
          %{scryfall_id: scryfall_id, finish: finish, price_cents: price_cents}
        end
      else
        _invalid_variant -> []
      end
    end)
  end

  def rows(_body, _special_treatment_ids), do: []

  defp first_price(variant, fields) do
    Enum.find_value(fields, fn field ->
      case variant[field] do
        price_cents when is_integer(price_cents) and price_cents > 0 -> price_cents
        _missing_or_invalid -> nil
      end
    end)
  end

  defp special_treatment_ids do
    Printing
    |> where([printing], printing.promo_types != "[]")
    |> select([printing], {printing.scryfall_id, printing.promo_types})
    |> Repo.all(timeout: :infinity)
    |> Enum.reduce(MapSet.new(), fn {scryfall_id, promo_types}, ids ->
      if special_treatment?(promo_types), do: MapSet.put(ids, scryfall_id), else: ids
    end)
  end

  defp special_treatment?(promo_types) do
    case Jason.decode(promo_types) do
      {:ok, promo_types} when is_list(promo_types) ->
        Enum.any?(promo_types, fn promo_type ->
          is_binary(promo_type) and
            (String.ends_with?(promo_type, "foil") or
               promo_type in @named_special_treatments)
        end)

      _invalid_json ->
        false
    end
  end
end
