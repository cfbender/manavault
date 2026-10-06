defmodule Manavault.Pricing.Vendors.TcgCsv do
  @moduledoc """
  TCGplayer prices via tcgcsv.com (free, no auth, refreshed daily around
  20:00 UTC).

  TCGplayer's own API is closed to new developers; tcgcsv republishes its
  per-group (set) pricing. Each price row is keyed by TCGplayer product ID and
  finish subtype, so rows join to printings through the `tcgplayer_id` and
  `tcgplayer_etched_id` Scryfall supplies at catalog import. Prices use
  TCGplayer's low price (TCG Low), falling back to the market price.
  Individual group failures are skipped so one bad set cannot lose a whole
  sync.
  """

  import Ecto.Query

  require Logger

  alias Manavault.Catalog.Printing
  alias Manavault.Pricing.Money
  alias Manavault.Repo

  @base_url "https://tcgcsv.com/tcgplayer/1"
  @user_agent "ManaVault/0.1 (+https://github.com/cfbender/manavault)"
  # tcgcsv asks scrapers to pace requests; ~450 Magic groups take about two
  # minutes at this rate.
  @request_delay_ms 250

  def vendor, do: "tcgplayer"

  def sync_interval, do: :timer.hours(24)

  def fetch(req_options \\ []) do
    {delay_ms, req_options} = Keyword.pop(req_options, :request_delay_ms, @request_delay_ms)

    with {:ok, %{"results" => groups}} when is_list(groups) <- get_json("/groups", req_options) do
      printings = product_printings()

      rows =
        groups
        |> Enum.map(& &1["groupId"])
        |> Enum.reject(&is_nil/1)
        |> Enum.flat_map(fn group_id ->
          Process.sleep(delay_ms)
          group_rows(group_id, printings, req_options)
        end)

      {:ok, rows}
    else
      {:ok, _body} -> {:error, "tcgcsv returned an unexpected groups payload"}
      {:error, reason} -> {:error, reason}
    end
  end

  defp group_rows(group_id, printings, req_options) do
    case get_json("/#{group_id}/prices", req_options) do
      {:ok, %{"results" => prices}} ->
        rows(prices, printings)

      {:ok, _body} ->
        Logger.warning("tcgcsv group #{group_id} skipped: unexpected prices payload")
        []

      {:error, reason} ->
        Logger.warning("tcgcsv group #{group_id} skipped: #{inspect(reason)}")
        []
    end
  end

  @doc """
  Printings by TCGplayer product ID, as `%{product_id => [{scryfall_id, etched?}]}`.
  Several printings can share a product, and etched printings have their own.
  """
  def product_printings do
    Printing
    |> where([p], not is_nil(p.tcgplayer_id) or not is_nil(p.tcgplayer_etched_id))
    |> select([p], {p.scryfall_id, p.tcgplayer_id, p.tcgplayer_etched_id})
    |> Repo.all()
    |> Enum.flat_map(fn {scryfall_id, tcgplayer_id, etched_id} ->
      [{tcgplayer_id, {scryfall_id, false}}, {etched_id, {scryfall_id, true}}]
    end)
    |> Enum.reject(fn {product_id, _printing} -> is_nil(product_id) end)
    |> Enum.group_by(&elem(&1, 0), &elem(&1, 1))
  end

  @doc """
  Maps a group's price rows to printing finishes. Products matched through an
  etched ID price the etched finish; otherwise `Foil` subtypes price foil and
  `Normal` prices nonfoil. Rows without a low or market price, or whose
  product has no printing, are skipped.
  """
  def rows(prices, printings) when is_list(prices) and is_map(printings) do
    for %{"productId" => product_id} = price <- prices,
        cents = Money.to_cents(price["lowPrice"]) || Money.to_cents(price["marketPrice"]),
        not is_nil(cents),
        {scryfall_id, etched?} <- Map.get(printings, product_id, []) do
      %{
        scryfall_id: scryfall_id,
        finish: finish(price["subTypeName"], etched?),
        price_cents: cents
      }
    end
  end

  def rows(_prices, _printings), do: []

  defp finish(_subtype, true = _etched?), do: "etched"

  defp finish(subtype, false = _etched?) do
    subtype = subtype |> to_string() |> String.downcase()

    cond do
      String.contains?(subtype, "etched") -> "etched"
      String.contains?(subtype, "foil") -> "foil"
      true -> "nonfoil"
    end
  end

  defp get_json(path, req_options) do
    options =
      Keyword.merge(
        [
          url: @base_url <> path,
          headers: [{"user-agent", @user_agent}],
          receive_timeout: :timer.minutes(2)
        ],
        req_options
      )

    case Req.get(options) do
      {:ok, %Req.Response{status: 200, body: body}} when is_map(body) -> {:ok, body}
      {:ok, %Req.Response{status: status}} -> {:error, "HTTP #{status}"}
      {:error, exception} -> {:error, Exception.message(exception)}
    end
  end
end
