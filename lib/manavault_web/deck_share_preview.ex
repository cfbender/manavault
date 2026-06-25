defmodule ManavaultWeb.DeckSharePreview do
  @moduledoc false

  alias Manavault.Catalog
  alias Manavault.Catalog.{Deck, DeckCard, Price}

  @image_width 1200
  @image_height 630
  @renderer "rsvg-convert"

  def image_width, do: @image_width
  def image_height, do: @image_height

  def default(attrs \\ %{}) do
    Map.merge(
      %{
        kind: :default,
        title: "ManaVault",
        description: "Magic deck and collection manager.",
        image_alt: "ManaVault",
        image_type: nil,
        image_url: nil,
        image_width: 512,
        image_height: 512,
        url: nil
      },
      attrs
    )
  end

  def from_deck(%Deck{} = deck, token) when is_binary(token) do
    card_count = Catalog.deck_card_count(deck)
    unique_card_count = Catalog.deck_unique_card_count(deck)
    format_label = titleize(deck.format)
    legality = Catalog.deck_legality(deck)
    legality_label = legality_label(legality)

    price_label =
      deck |> counted_deck_cards() |> Price.deck_cards_total_cents() |> format_price_cents()

    deck_name = deck.name || "Shared deck"

    %{
      kind: :deck,
      token: token,
      deck_name: deck_name,
      title: "#{deck_name} · ManaVault",
      description:
        deck_description(format_label, card_count, unique_card_count, legality_label, price_label),
      image_alt: "Preview for #{deck_name}",
      image_type: "image/svg+xml",
      image_url: nil,
      image_width: @image_width,
      image_height: @image_height,
      url: nil,
      cover_image_url: Catalog.deck_cover_image_url(deck),
      format_label: format_label,
      status_label: titleize(deck.status),
      card_count_label: "#{compact_number(card_count)} cards",
      unique_count_label: "#{compact_number(unique_card_count)} unique",
      legality_label: legality_label,
      price_label: price_label,
      color_identity: Catalog.deck_commander_color_identity(deck) || []
    }
  end

  def svg(%{kind: :deck} = preview) do
    deck_name = one_line(preview.deck_name)
    title_size = title_font_size(deck_name)
    deck_name = truncate_for_width(deck_name, title_width(preview.color_identity), title_size)
    unique_x = 72 + badge_width(preview.status_label) + 28
    legality_x = unique_x + text_width(preview.unique_count_label, 27) + 28
    price_x = legality_x + badge_width(preview.legality_label) + 20

    """
    <svg xmlns="http://www.w3.org/2000/svg" width="#{@image_width}" height="#{@image_height}" viewBox="0 0 #{@image_width} #{@image_height}" role="img" aria-label="#{xml_escape(preview.image_alt)}">
      <defs>
        <linearGradient id="manavaultShade" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#171018" stop-opacity="0.96" />
          <stop offset="48%" stop-color="#251827" stop-opacity="0.82" />
          <stop offset="100%" stop-color="#2b1720" stop-opacity="0.54" />
        </linearGradient>
        <radialGradient id="manavaultGlow" cx="82%" cy="18%" r="74%">
          <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.34" />
          <stop offset="52%" stop-color="#a855f7" stop-opacity="0.14" />
          <stop offset="100%" stop-color="#020617" stop-opacity="0" />
        </radialGradient>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#000000" flood-opacity="0.45" />
        </filter>
        <clipPath id="cardClip">
          <rect x="32" y="32" width="1136" height="566" rx="34" />
        </clipPath>
      </defs>
      <style>
        text { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      </style>
      <g clip-path="url(#cardClip)">
        #{background_markup(preview.cover_image_url)}
        <rect width="1200" height="630" fill="url(#manavaultShade)" />
        <rect width="1200" height="630" fill="url(#manavaultGlow)" />
      </g>
      <rect x="32" y="32" width="1136" height="566" rx="34" fill="none" stroke="#ffffff" stroke-opacity="0.13" stroke-width="2" />

      #{badge(72, 74, preview.format_label, :neutral)}
      <text x="#{96 + badge_width(preview.format_label)}" y="111" fill="#e7dfdf" fill-opacity="0.78" font-size="30" font-weight="800">#{xml_escape(preview.card_count_label)}</text>

      <g filter="url(#softShadow)">
        <text x="72" y="372" fill="#f8f0ef" font-size="#{title_size}" font-weight="950" letter-spacing="-1.6">#{xml_escape(deck_name)}</text>
      </g>
      #{mana_symbols(preview.color_identity)}

      #{badge(72, 432, preview.status_label, :success)}
      <text x="#{unique_x}" y="469" fill="#e7dfdf" fill-opacity="0.74" font-size="27" font-weight="650">#{xml_escape(preview.unique_count_label)}</text>
      #{badge(legality_x, 432, preview.legality_label, legality_tone(preview.legality_label))}
      #{badge(price_x, 432, preview.price_label, :warning)}

      <text x="72" y="548" fill="#e7dfdf" fill-opacity="0.48" font-size="24" font-weight="700">Shared with ManaVault</text>
    </svg>
    """
  end

  def png(%{kind: :deck} = preview) do
    path =
      Path.join(
        System.tmp_dir!(),
        "manavault-share-preview-#{System.unique_integer([:positive])}.svg"
      )

    try do
      File.write!(path, svg(preview))

      case System.cmd(@renderer, [
             "--format=png",
             "--width=#{@image_width}",
             "--height=#{@image_height}",
             path
           ]) do
        {png, 0} -> {:ok, png}
        {_output, _status} -> {:error, :render_failed}
      end
    after
      File.rm(path)
    end
  rescue
    ErlangError -> {:error, :renderer_unavailable}
    File.Error -> {:error, :render_failed}
  end

  defp deck_description(format_label, card_count, unique_card_count, legality_label, price_label) do
    [
      "#{format_label} deck",
      "#{compact_number(card_count)} cards",
      "#{compact_number(unique_card_count)} unique",
      legality_label,
      price_label
    ]
    |> Enum.reject(&blank?/1)
    |> Enum.join(", ")
    |> then(&(&1 <> "."))
  end

  defp counted_deck_cards(%Deck{deck_cards: deck_cards}) when is_list(deck_cards) do
    Enum.filter(deck_cards, &DeckCard.counts_toward_deck_total?/1)
  end

  defp counted_deck_cards(%Deck{} = deck) do
    deck
    |> Catalog.deck_cards()
    |> Enum.filter(&DeckCard.counts_toward_deck_total?/1)
  end

  defp legality_label(%{status: "legal"}), do: "Legal"
  defp legality_label(_legality), do: "Illegal"

  defp legality_tone("Legal"), do: :success
  defp legality_tone(_label), do: :error

  defp titleize(value) when is_binary(value) do
    value
    |> String.replace(["_", "-"], " ")
    |> String.split(" ", trim: true)
    |> Enum.map_join(" ", &String.capitalize/1)
  end

  defp titleize(_value), do: "Deck"

  defp compact_number(value) when is_integer(value) and value >= 1_000_000 do
    value
    |> Kernel./(1_000_000)
    |> compact_decimal()
    |> Kernel.<>("m")
  end

  defp compact_number(value) when is_integer(value) and value >= 1_000 do
    value
    |> Kernel./(1_000)
    |> compact_decimal()
    |> Kernel.<>("k")
  end

  defp compact_number(value) when is_integer(value), do: Integer.to_string(value)
  defp compact_number(_value), do: "0"

  defp format_price_cents(nil), do: nil

  defp format_price_cents(cents) when is_integer(cents) do
    dollars = div(cents, 100)
    remainder = rem(cents, 100)

    if remainder == 0 do
      "$#{dollars}"
    else
      "$#{dollars}.#{remainder |> Integer.to_string() |> String.pad_leading(2, "0")}"
    end
  end

  defp format_price_cents(_value), do: nil

  defp compact_decimal(value) do
    rounded = Float.round(value, 1)

    if rounded == trunc(rounded) do
      Integer.to_string(trunc(rounded))
    else
      :erlang.float_to_binary(rounded, decimals: 1)
    end
  end

  defp title_font_size(name) do
    length = String.length(name)

    cond do
      length <= 24 -> 72
      length <= 34 -> 62
      true -> 52
    end
  end

  defp title_width(colors) when is_list(colors) do
    if Enum.any?(colors, &(not blank?(&1))), do: 760, else: 1040
  end

  defp title_width(_colors), do: 1040

  defp background_markup(url) when is_binary(url) and url != "" do
    ~s(<image href="#{xml_escape(url)}" x="0" y="0" width="1200" height="630" preserveAspectRatio="xMidYMid slice" opacity="0.78" />)
  end

  defp background_markup(_url) do
    ~s(<rect width="1200" height="630" fill="#211722" />)
  end

  defp badge(x, y, label, tone) do
    label = one_line(label || "")
    width = badge_width(label)
    {stroke, fill, text} = badge_colors(tone)

    """
    <g>
      <rect x="#{x}" y="#{y}" width="#{width}" height="42" rx="9" fill="#{fill}" stroke="#{stroke}" stroke-opacity="0.78" stroke-width="2" />
      <text x="#{x + 22}" y="#{y + 29}" fill="#{text}" font-size="22" font-weight="750">#{xml_escape(label)}</text>
    </g>
    """
  end

  defp badge_width(label), do: max(90, text_width(label, 22) + 44)

  defp text_width(label, font_size) do
    label
    |> to_string()
    |> String.length()
    |> Kernel.*(font_size * 0.72)
    |> ceil()
  end

  defp badge_colors(:success), do: {"#86efac", "#16321f", "#d7ffe3"}
  defp badge_colors(:error), do: {"#fca5a5", "#3a1717", "#ffe2e2"}
  defp badge_colors(:warning), do: {"#facc15", "#38270b", "#fff3bd"}
  defp badge_colors(_tone), do: {"#f0d7c4", "#2a1d22", "#f8f0ef"}

  defp mana_symbols(colors) when is_list(colors) do
    colors
    |> Enum.reject(&blank?/1)
    |> Enum.take(5)
    |> Enum.with_index()
    |> Enum.map_join("\n", fn {color, index} ->
      x = 890 + index * 54

      """
      <g filter="url(#softShadow)">
        <image href="#{xml_escape(mana_symbol_url(color))}" x="#{x - 24}" y="327" width="48" height="48" preserveAspectRatio="xMidYMid meet" />
      </g>
      """
    end)
  end

  defp mana_symbols(_colors), do: ""

  defp mana_symbol_url(color) do
    symbol =
      color
      |> to_string()
      |> String.replace("/", "")
      |> String.upcase()
      |> URI.encode(&URI.char_unreserved?/1)

    "/scryfall-assets/symbols/#{symbol}.svg"
  end

  defp truncate_for_width(value, max_width, font_size) do
    max_length = max(8, floor(max_width / (font_size * 0.72)))
    truncate(value, max_length)
  end

  defp truncate(value, max_length) do
    if String.length(value) <= max_length do
      value
    else
      String.slice(value, 0, max_length - 1) <> "…"
    end
  end

  defp one_line(value) do
    value
    |> to_string()
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
  end

  defp blank?(value), do: one_line(value) == ""

  defp xml_escape(value) do
    value
    |> to_string()
    |> Phoenix.HTML.html_escape()
    |> Phoenix.HTML.safe_to_string()
  end
end
