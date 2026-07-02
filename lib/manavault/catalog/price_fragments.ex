defmodule Manavault.Catalog.PriceFragments do
  @moduledoc """
  Shared Ecto `fragment/1` macros for pricing collection items from the Scryfall
  `prices` JSON.

  Import the specific macros you need into a module that also imports
  `Ecto.Query` (the emitted `fragment/…` and composed macro calls resolve in the
  caller's context). Macros that build on others (`price_cents_fragment`, the
  `*_total_cents_fragment`s) require the whole chain to be imported alongside
  them.
  """

  @doc "Finish-aware USD price (as REAL) for an item's printing."
  defmacro price_value_fragment(item, printing) do
    quote do
      fragment(
        """
        CAST(COALESCE(NULLIF(
          CASE ?
            WHEN 'foil' THEN COALESCE(json_extract(?, '$.usd_foil'), json_extract(?, '$.usd'))
            WHEN 'etched' THEN COALESCE(json_extract(?, '$.usd_etched'), json_extract(?, '$.usd_foil'), json_extract(?, '$.usd'))
            ELSE COALESCE(json_extract(?, '$.usd'), json_extract(?, '$.usd_foil'), json_extract(?, '$.usd_etched'))
          END,
          ''
        ), '0') AS REAL)
        """,
        unquote(item).finish,
        unquote(printing).prices,
        unquote(printing).prices,
        unquote(printing).prices,
        unquote(printing).prices,
        unquote(printing).prices,
        unquote(printing).prices,
        unquote(printing).prices,
        unquote(printing).prices
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

  @doc "Finish-agnostic USD price (as REAL): usd, then usd_foil, then usd_etched."
  defmacro price_fragment(printing) do
    quote do
      fragment(
        """
        CAST(COALESCE(NULLIF(
          COALESCE(json_extract(?, '$.usd'), json_extract(?, '$.usd_foil'), json_extract(?, '$.usd_etched')),
          ''
        ), '0') AS REAL)
        """,
        unquote(printing).prices,
        unquote(printing).prices,
        unquote(printing).prices
      )
    end
  end
end
