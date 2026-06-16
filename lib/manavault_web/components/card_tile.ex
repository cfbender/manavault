defmodule ManavaultWeb.CardTile do
  @moduledoc false

  use Phoenix.Component

  alias Manavault.Catalog.{CollectionItem, Printing, ScanItem}

  use Phoenix.VerifiedRoutes,
    endpoint: ManavaultWeb.Endpoint,
    router: ManavaultWeb.Router,
    statics: ManavaultWeb.static_paths()

  attr :item, :any, required: true
  attr :id, :string, default: nil
  attr :class, :string, default: ""
  attr :selected_item, :any, default: nil
  attr :change_printing_item, :any, default: nil
  attr :show_menu, :boolean, default: true
  attr :details_event, :string, default: "show_details"
  attr :menu, :atom, default: :collection, values: [:collection, :scan, :none]

  def card_tile(assigns) do
    assigns =
      assigns
      |> assign_new(:dom_id, fn -> assigns.id || default_id(assigns.item) end)
      |> assign(:image_url, item_image_url(assigns.item))
      |> assign(:card_name, card_name(assigns.item))
      |> assign(:set_code, set_code(assigns.item))
      |> assign(:price_text, price_text(assigns.item))
      |> assign(:quantity, item_quantity(assigns.item))

    ~H"""
    <div
      id={@dom_id}
      class={[
        "group card relative overflow-visible border border-base-300 bg-base-100 shadow-sm transition hover:z-50 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl",
        @class
      ]}
    >
      <span class="absolute top-1.5 right-1.5 z-30 badge badge-primary badge-sm font-bold">
        ×{@quantity}
      </span>
      <div
        :if={@show_menu and @menu != :none and !@selected_item and !@change_printing_item}
        class="dropdown dropdown-end absolute top-8 right-1.5 z-50"
      >
        <button
          type="button"
          class="btn btn-circle btn-xs bg-base-100/85 backdrop-blur-sm shadow"
          tabindex="0"
          aria-label="Card actions"
        >
          ⋮
        </button>
        <ul
          tabindex="0"
          class="menu dropdown-content z-50 mt-1 w-44 rounded-box border border-base-300 bg-base-100 p-2 text-sm shadow-xl"
        >
          <li :if={@menu == :collection}>
            <.link navigate={~p"/collection/#{@item.id}/edit"}>Edit</.link>
          </li>
          <li :if={@menu == :collection}>
            <button type="button" phx-click="change_printing" phx-value-id={@item.id}>
              Change printing
            </button>
          </li>
          <li :if={@menu == :collection}>
            <button type="button" class="text-error" phx-click="delete" phx-value-id={@item.id}>
              Delete
            </button>
          </li>
          <li :if={@menu == :scan}>
            <button type="button" phx-click="edit_scan_item" phx-value-id={@item.id}>Edit</button>
          </li>
          <li :if={@menu == :scan}>
            <button type="button" phx-click="change_scan_printing" phx-value-id={@item.id}>
              Change printing
            </button>
          </li>
          <li :if={@menu == :scan}>
            <button
              type="button"
              class="text-error"
              phx-click="delete_scan_item"
              phx-value-id={@item.id}
            >
              Delete
            </button>
          </li>
        </ul>
      </div>
      <figure class="aspect-[5/7] overflow-hidden rounded-t-box bg-base-200 relative">
        <img
          :if={@image_url}
          src={@image_url}
          alt={@card_name}
          class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          loading="lazy"
        />
        <div
          :if={!@image_url}
          class="flex h-full w-full items-center justify-center p-6 text-center text-sm text-base-content/50"
        >
          No image
        </div>

        <span class="absolute bottom-1.5 left-1.5 z-20 badge badge-sm badge-outline bg-base-100/80 backdrop-blur-sm font-bold">
          {@set_code}
        </span>
        <span
          :if={@price_text}
          class="absolute bottom-1.5 right-1.5 z-20 badge badge-sm bg-base-100/80 backdrop-blur-sm font-mono text-xs"
        >
          {@price_text}
        </span>
        <button
          type="button"
          phx-click={@details_event}
          phx-value-id={@item.id}
          class="absolute inset-0 z-10 bg-black/0 transition group-hover:bg-black/20 flex items-start p-2 text-left"
        >
          <span class="text-xs text-white opacity-0 group-hover:opacity-100 transition">
            Click for details
          </span>
        </button>
      </figure>
      <div class="card-body gap-2 p-3">
        <h3 class="line-clamp-1 text-sm font-bold leading-snug">{@card_name}</h3>
      </div>
    </div>
    """
  end

  def card_name(%CollectionItem{printing: %{card: %{name: name}}}), do: name

  def card_name(%ScanItem{} = item),
    do: item |> tile_printing() |> printing_card_name() || "Scan item ##{item.id}"

  def card_name(_item), do: "Unknown card"

  def set_label(%CollectionItem{
        printing: %{set_code: set_code, collector_number: collector_number}
      }) do
    "#{String.upcase(set_code)} ##{collector_number}"
  end

  def set_label(%ScanItem{} = item), do: item |> tile_printing() |> printing_set_label()

  def set_code(%CollectionItem{printing: %{set_code: set_code}}) when is_binary(set_code),
    do: String.upcase(set_code)

  def set_code(%ScanItem{} = item), do: item |> tile_printing() |> printing_set_code()
  def set_code(_item), do: "?"

  def price_text(%CollectionItem{printing: %Printing{prices: prices}}),
    do: price_text_from_prices(prices)

  def price_text(%ScanItem{} = item), do: item |> tile_printing() |> printing_price_text()
  def price_text(%Printing{prices: prices}), do: price_text_from_prices(prices)
  def price_text(_item), do: nil

  def item_image_url(%CollectionItem{printing: printing}), do: printing_image_url(printing)
  def item_image_url(%ScanItem{} = item), do: item |> tile_printing() |> printing_image_url()
  def item_image_url(_item), do: nil

  defp default_id(%CollectionItem{id: id}), do: "collection-item-#{id}"
  defp default_id(%ScanItem{id: id}), do: "scan-item-#{id}"
  defp default_id(_item), do: nil

  defp item_quantity(%{quantity: quantity}) when is_integer(quantity), do: quantity
  defp item_quantity(_item), do: 1

  defp tile_printing(%ScanItem{accepted_printing: %Printing{} = printing}), do: printing
  defp tile_printing(_item), do: nil

  defp printing_card_name(%Printing{card: %{name: name}}), do: name
  defp printing_card_name(_printing), do: nil

  defp printing_set_label(%Printing{set_code: set_code, collector_number: collector_number}) do
    "#{String.upcase(set_code)} ##{collector_number}"
  end

  defp printing_set_label(_printing), do: "Unknown printing"

  defp printing_set_code(%Printing{set_code: set_code}) when is_binary(set_code),
    do: String.upcase(set_code)

  defp printing_set_code(_printing), do: "?"

  defp printing_price_text(%Printing{prices: prices}), do: price_text_from_prices(prices)
  defp printing_price_text(_printing), do: nil

  defp price_text_from_prices(prices) do
    prices
    |> decode_json(%{})
    |> then(fn
      %{"usd" => usd} when is_binary(usd) and usd != "" ->
        "$#{format_price(usd)}"

      %{"usd_foil" => foil} when is_binary(foil) and foil != "" ->
        "$#{format_price(foil)}"

      map when is_map(map) ->
        map
        |> Map.values()
        |> Enum.find(&is_binary/1)
        |> then(fn
          nil -> nil
          value -> "$#{format_price(value)}"
        end)

      _other ->
        nil
    end)
  end

  defp format_price(price) do
    case Float.parse(price) do
      {num, _rest} when num >= 100 -> num |> trunc() |> Integer.to_string()
      {num, _rest} -> :erlang.float_to_binary(num, decimals: 2)
      :error -> price
    end
  end

  defp printing_image_url(%Printing{image_uris: image_uris}) do
    with {:ok, uris} <- Jason.decode(image_uris) do
      image_url_from_uris(uris)
    else
      _ -> nil
    end
  end

  defp printing_image_url(_printing), do: nil

  defp image_url_from_uris(uris) when is_map(uris) do
    uris["normal"] || uris["large"] || uris["small"] || uris["png"]
  end

  defp image_url_from_uris([uris | _]), do: image_url_from_uris(uris)
  defp image_url_from_uris(_uris), do: nil

  defp decode_json(value, fallback) when is_binary(value) do
    case Jason.decode(value) do
      {:ok, decoded} -> decoded
      {:error, _reason} -> fallback
    end
  end

  defp decode_json(_value, fallback), do: fallback
end
