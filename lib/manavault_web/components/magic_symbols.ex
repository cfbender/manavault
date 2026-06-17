defmodule ManavaultWeb.MagicSymbols do
  @moduledoc false

  use Phoenix.Component

  alias Manavault.ScryfallAssets

  attr :text, :string, required: true
  attr :class, :any, default: nil

  def symbolized_text(assigns) do
    assigns = assign(assigns, :parts, symbol_parts(assigns.text))

    ~H"""
    <span class={@class}>
      <%= for part <- @parts do %>
        <.symbol :if={part.symbol?} symbol={part.text} />
        {if !part.symbol?, do: part.text}
      <% end %>
    </span>
    """
  end

  attr :symbols, :list, required: true
  attr :class, :any, default: nil

  def symbol_list(assigns) do
    ~H"""
    <span class={["inline-flex items-center gap-0.5", @class]}>
      <.symbol :for={symbol <- @symbols} symbol={symbol} />
    </span>
    """
  end

  attr :symbol, :string, required: true
  attr :class, :any, default: nil

  def symbol(assigns) do
    assigns =
      assigns
      |> assign(:entry, ScryfallAssets.symbol(assigns.symbol))
      |> assign(:normalized_symbol, normalize_symbol(assigns.symbol))

    ~H"""
    <img
      :if={@entry && @entry["local_uri"]}
      src={@entry["local_uri"]}
      alt={@normalized_symbol}
      title={@entry["english"] || @normalized_symbol}
      data-symbol={@normalized_symbol}
      class={["mana-symbol inline-block h-[1.15em] w-[1.15em] align-[-0.18em]", @class]}
      loading="lazy"
    />
    <span :if={!@entry || !@entry["local_uri"]} data-symbol={@normalized_symbol} class={@class}>
      {@normalized_symbol}
    </span>
    """
  end

  attr :set_code, :string, required: true
  attr :label, :string, default: nil
  attr :rarity, :string, default: nil
  attr :class, :any, default: nil
  attr :fallback_class, :any, default: nil

  def set_icon(assigns) do
    assigns =
      assigns
      |> assign(:entry, ScryfallAssets.set(assigns.set_code || ""))
      |> assign(:normalized_code, String.upcase(assigns.set_code || "?"))
      |> assign(
        :mask_style,
        set_icon_mask_style(ScryfallAssets.set(assigns.set_code || ""), assigns.rarity)
      )

    ~H"""
    <span
      :if={@entry && @entry["local_uri"]}
      title={@label || @entry["name"] || @normalized_code}
      role="img"
      aria-label={@label || @entry["name"] || @normalized_code}
      data-set-code={@normalized_code}
      class={["set-symbol inline-block h-[1.3em] w-[1.3em] align-[-0.2em]", @class]}
      style={@mask_style}
    ></span>
    <span :if={!@entry || !@entry["local_uri"]} class={@fallback_class}>{@normalized_code}</span>
    """
  end

  defp set_icon_mask_style(%{"local_uri" => local_uri}, rarity)
       when is_binary(local_uri) and local_uri != "" do
    color = rarity_color(rarity)

    [
      "background-color: #{color}",
      "mask-image: url('#{local_uri}')",
      "-webkit-mask-image: url('#{local_uri}')",
      "mask-position: center",
      "-webkit-mask-position: center",
      "mask-repeat: no-repeat",
      "-webkit-mask-repeat: no-repeat",
      "mask-size: contain",
      "-webkit-mask-size: contain"
    ]
    |> Enum.join("; ")
  end

  defp set_icon_mask_style(_entry, _rarity), do: nil

  defp rarity_color("mythic"), do: "#de652a"
  defp rarity_color("rare"), do: "#c9aa6a"
  defp rarity_color("uncommon"), do: "#a9c2c3"
  defp rarity_color("common"), do: "#171717"
  defp rarity_color(_rarity), do: "#171717"

  defp symbol_parts(text) when is_binary(text) do
    ~r/\{[^}]+\}/
    |> Regex.split(text, include_captures: true, trim: false)
    |> Enum.reject(&(&1 == ""))
    |> Enum.map(fn part -> %{text: part, symbol?: Regex.match?(~r/^\{[^}]+\}$/, part)} end)
  end

  defp normalize_symbol("{" <> _rest = symbol), do: symbol
  defp normalize_symbol(symbol), do: "{#{symbol}}"
end
