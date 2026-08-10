defmodule Manavault.Pricing.Vendors.TcgTracking do
  @moduledoc """
  TCGPlayer prices via openapi.tcgtracking.com (free, no auth, updated daily).

  TCGPlayer's own API is closed to new developers, so this walks every MTG
  set on tcgtracking, joining each set's card products (which carry Scryfall
  IDs) with its pricing block (TCGPlayer market/low per finish subtype).
  Individual set failures are skipped so one bad set cannot lose a whole sync.
  """

  require Logger

  alias Manavault.Pricing.Money

  @base_url "https://openapi.tcgtracking.com/v1"
  @magic_category 1

  def vendor, do: "tcgplayer"

  def sync_interval, do: :timer.hours(24)

  def fetch(req_options \\ []) do
    with {:ok, %{"sets" => sets}} when is_list(sets) <- get_json("/sets", req_options) do
      rows =
        sets
        |> Enum.map(& &1["id"])
        |> Enum.reject(&is_nil/1)
        |> Enum.flat_map(&set_rows(&1, req_options))

      {:ok, rows}
    else
      {:ok, _body} -> {:error, "tcgtracking returned an unexpected sets payload"}
      {:error, reason} -> {:error, reason}
    end
  end

  defp set_rows(set_id, req_options) do
    with {:ok, cards} <- get_json("/sets/#{set_id}/cards", req_options),
         {:ok, pricing} <- get_json("/sets/#{set_id}/pricing", req_options) do
      rows(cards, pricing)
    else
      {:error, reason} ->
        Logger.warning("tcgtracking set #{set_id} skipped: #{inspect(reason)}")
        []
    end
  end

  @doc """
  Joins a set's card products with its pricing block. Uses TCGPlayer market
  price and falls back to the lowest listing when no market price exists.
  """
  def rows(%{"products" => products}, %{"prices" => prices})
      when is_list(products) and is_map(prices) do
    Enum.flat_map(products, fn product ->
      with scryfall_id when is_binary(scryfall_id) and scryfall_id != "" <-
             product_scryfall_id(product),
           %{"tcg" => subtypes} when is_map(subtypes) <- prices[to_string(product["id"])] do
        subtype_rows(scryfall_id, subtypes)
      else
        _missing -> []
      end
    end)
  end

  def rows(_cards, _pricing), do: []

  # Some products (notably special treatments like surge foils) have no
  # top-level scryfall_id but carry one in their matched cardtrader entry.
  defp product_scryfall_id(%{"scryfall_id" => scryfall_id})
       when is_binary(scryfall_id) and scryfall_id != "" do
    scryfall_id
  end

  defp product_scryfall_id(%{"cardtrader" => [%{"scryfall_id" => scryfall_id} | _rest]})
       when is_binary(scryfall_id) and scryfall_id != "" do
    scryfall_id
  end

  defp product_scryfall_id(_product), do: nil

  defp subtype_rows(scryfall_id, subtypes) do
    for {subtype, price} <- subtypes,
        is_map(price),
        cents = Money.to_cents(price["market"] || price["low"]),
        not is_nil(cents) do
      %{scryfall_id: scryfall_id, finish: subtype_finish(subtype), price_cents: cents}
    end
  end

  defp subtype_finish(subtype) do
    subtype = String.downcase(subtype)

    cond do
      String.contains?(subtype, "etched") -> "etched"
      String.contains?(subtype, "foil") -> "foil"
      true -> "nonfoil"
    end
  end

  defp get_json(path, req_options) do
    options =
      Keyword.merge(
        [url: @base_url <> "/#{@magic_category}" <> path, receive_timeout: :timer.minutes(2)],
        req_options
      )

    case Req.get(options) do
      {:ok, %Req.Response{status: 200, body: body}} when is_map(body) -> {:ok, body}
      {:ok, %Req.Response{status: status}} -> {:error, "HTTP #{status}"}
      {:error, exception} -> {:error, Exception.message(exception)}
    end
  end
end
