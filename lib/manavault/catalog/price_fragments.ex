defmodule Manavault.Catalog.PriceFragments do
  @moduledoc """
  Shared Ecto `fragment/1` macros for current collection-item prices.

  Import the specific macros you need into a module that also imports
  `Ecto.Query` (the emitted `fragment/…` and composed macro calls resolve in the
  caller's context). Macros that build on others (`price_cents_fragment`, the
  `*_total_cents_fragment`s) require the whole chain to be imported alongside
  them.

  The finish-to-key fallback ordering is compiled in from
  `Manavault.Catalog.Price.usd_fallback_keys/1`, keeping the SQL and
  in-memory pricing paths on one authoritative ordering.
  """

  alias Manavault.Catalog.Price

  coalesce_sql = fn keys ->
    "COALESCE(" <> Enum.map_join(keys, ", ", &"json_extract(?, '$.#{&1}')") <> ")"
  end

  vendor_order_sql = fn finishes ->
    cases =
      finishes
      |> Enum.with_index(1)
      |> Enum.map_join(" ", fn {finish, priority} ->
        "WHEN '#{finish}' THEN #{priority}"
      end)

    "CASE vendor_price.finish #{cases} ELSE #{length(finishes) + 1} END"
  end

  @foil_keys Price.usd_fallback_keys("foil")
  @etched_keys Price.usd_fallback_keys("etched")
  @default_keys Price.usd_fallback_keys(nil)

  @foil_vendor_order vendor_order_sql.(Price.finish_fallbacks("foil"))
  @etched_vendor_order vendor_order_sql.(Price.finish_fallbacks("etched"))
  @default_vendor_order vendor_order_sql.(Price.finish_fallbacks(nil))

  @vendor_price_sql """
  SELECT vendor_price.price_cents / 100.0
  FROM vendor_prices AS vendor_price
  WHERE vendor_price.vendor = (
    SELECT pricing_setting.source
    FROM pricing_settings AS pricing_setting
    WHERE pricing_setting.id = 1
  )
    AND vendor_price.scryfall_id = ?
    AND vendor_price.finish IN ('nonfoil', 'foil', 'etched')
  ORDER BY
    CASE ?
      WHEN 'foil' THEN #{@foil_vendor_order}
      WHEN 'etched' THEN #{@etched_vendor_order}
      ELSE #{@default_vendor_order}
    END
  LIMIT 1
  """

  @finish_case_sql """
  COALESCE(
    (#{@vendor_price_sql}),
    CAST(COALESCE(NULLIF(
      CASE ?
        WHEN 'foil' THEN #{coalesce_sql.(@foil_keys)}
        WHEN 'etched' THEN #{coalesce_sql.(@etched_keys)}
        ELSE #{coalesce_sql.(@default_keys)}
      END,
      ''
    ), '0') AS REAL)
  )
  """
  @finish_case_prices_count length(@foil_keys) + length(@etched_keys) + length(@default_keys)

  @default_price_sql """
  COALESCE(
    (
      SELECT vendor_price.price_cents / 100.0
      FROM vendor_prices AS vendor_price
      WHERE vendor_price.vendor = (
        SELECT pricing_setting.source
        FROM pricing_settings AS pricing_setting
        WHERE pricing_setting.id = 1
      )
        AND vendor_price.scryfall_id = ?
        AND vendor_price.finish IN ('nonfoil', 'foil', 'etched')
      ORDER BY #{@default_vendor_order}
      LIMIT 1
    ),
    CAST(COALESCE(NULLIF(
      #{coalesce_sql.(@default_keys)},
      ''
    ), '0') AS REAL)
  )
  """
  @default_price_prices_count length(@default_keys)

  @doc "Finish-aware current USD price (as REAL) for an item's printing."
  defmacro price_value_fragment(item, printing) do
    prices = List.duplicate(quote(do: unquote(printing).prices), @finish_case_prices_count)

    quote do
      fragment(
        unquote(@finish_case_sql),
        unquote(printing).scryfall_id,
        unquote(item).finish,
        unquote(item).finish,
        unquote_splicing(prices)
      )
    end
  end

  @doc "Finish-aware price in integer cents."
  defmacro price_cents_fragment(item, printing) do
    quote do
      fragment(
        "CAST(round(? * 100) AS INTEGER)",
        price_value_fragment(unquote(item), unquote(printing))
      )
    end
  end

  @doc "SUM of quantity * current price cents across grouped rows."
  defmacro current_total_cents_fragment(item, printing) do
    quote do
      fragment(
        "COALESCE(SUM(? * COALESCE(?, 0)), 0)",
        unquote(item).quantity,
        price_cents_fragment(unquote(item), unquote(printing))
      )
    end
  end

  @doc "SUM of quantity * purchase price cents, falling back to current price."
  defmacro purchase_total_cents_fragment(item, printing) do
    quote do
      fragment(
        "COALESCE(SUM(? * COALESCE(?, ?, 0)), 0)",
        unquote(item).quantity,
        unquote(item).purchase_price_cents,
        price_cents_fragment(unquote(item), unquote(printing))
      )
    end
  end

  @doc "Finish-agnostic USD price (as REAL), in the default fallback order."
  defmacro price_fragment(printing) do
    prices = List.duplicate(quote(do: unquote(printing).prices), @default_price_prices_count)

    quote do
      fragment(
        unquote(@default_price_sql),
        unquote(printing).scryfall_id,
        unquote_splicing(prices)
      )
    end
  end
end
