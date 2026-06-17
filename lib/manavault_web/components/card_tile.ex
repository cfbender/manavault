defmodule ManavaultWeb.CardTile do
  @moduledoc false

  use Phoenix.Component
  import ManavaultWeb.MagicSymbols

  alias Manavault.Catalog.{CollectionItem, DeckCard, Price, Printing, ScanItem}

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
  attr :click_value_id, :any, default: nil
  attr :click_value_scryfall_id, :string, default: nil
  attr :click_disabled, :boolean, default: false
  attr :current, :boolean, default: false
  attr :edit_path, :string, default: nil
  attr :menu, :atom, default: :collection, values: [:collection, :scan, :none]
  attr :variant, :atom, default: :default, values: [:default, :compact]

  attr :details_visibility, :atom,
    default: :hover,
    values: [:hover, :always],
    doc: "when to show the title/set/quantity/price overlay"

  def card_tile(assigns) do
    assigns =
      assigns
      |> assign_new(:dom_id, fn -> assigns.id || default_id(assigns.item) end)
      |> assign(:image_url, item_image_url(assigns.item))
      |> assign(:card_name, card_name(assigns.item))
      |> assign(:set_code, set_code(assigns.item))
      |> assign(:set_rarity, set_rarity(assigns.item))
      |> assign(:price_text, price_text(assigns.item))
      |> assign(:quantity, item_quantity(assigns.item))
      |> assign(:finish, item_finish(assigns.item))
      |> assign(:click_id, assigns.click_value_id || item_click_id(assigns.item))

    ~H"""
    <div
      id={@dom_id}
      class={[
        "group/card relative overflow-visible rounded-xl bg-transparent transition duration-200 focus-within:z-50",
        !@click_disabled && "hover:z-50 hover:-translate-y-1",
        @current && "ring-2 ring-primary/70",
        @class
      ]}
    >
      <div
        :if={@show_menu and @menu != :none and !@selected_item and !@change_printing_item}
        class="dropdown dropdown-end absolute top-2 right-2 z-50"
      >
        <button
          type="button"
          class="btn btn-circle btn-xs border-0 bg-base-300/80 text-base-content shadow backdrop-blur transition hover:bg-base-100 focus:bg-base-100"
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
            <.link navigate={@edit_path || ~p"/collection/#{@item.id}/edit"}>Edit</.link>
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

      <figure class={[
        "relative aspect-[5/7] overflow-hidden rounded-xl bg-base-300 shadow-lg ring-1 ring-white/10 transition duration-200 group-focus-within/card:ring-primary/50",
        foil_finish?(@finish) && "card-tile-foil",
        @finish == "etched" && "card-tile-foil--etched",
        !@click_disabled && "group-hover/card:shadow-2xl group-hover/card:ring-primary/40"
      ]}>
        <img
          :if={@image_url}
          src={@image_url}
          alt={@card_name}
          class="h-full w-full object-cover transition duration-300 group-hover/card:scale-[1.015]"
          loading="lazy"
        />
        <div
          :if={!@image_url}
          class="flex h-full w-full items-center justify-center p-6 text-center text-sm text-base-content/50"
        >
          No image
        </div>

        <span
          :if={foil_finish?(@finish)}
          class="card-tile-foil-badge"
          aria-label={finish_label(@finish)}
          title={finish_label(@finish)}
        >
          {finish_label(@finish)}
        </span>

        <button
          type="button"
          phx-click={@details_event}
          phx-value-id={@click_id}
          phx-value-scryfall_id={@click_value_scryfall_id}
          class={[
            "absolute inset-0 z-10 flex items-end bg-gradient-to-t from-black/85 via-black/20 to-black/0 text-left transition duration-200 group-focus-within/card:opacity-100",
            @variant == :compact && "p-2 opacity-100",
            @variant == :default && "p-3",
            @variant == :default && @details_visibility == :hover &&
              "opacity-0 group-hover/card:opacity-100",
            @variant == :default && @details_visibility == :always && "opacity-100",
            @click_disabled && "cursor-default"
          ]}
          aria-label={"Show details for #{@card_name}"}
          disabled={@click_disabled}
        >
          <span class="sr-only">Click for details</span>
          <span class={[
            "grid w-full text-white",
            @variant == :compact && "gap-1",
            @variant == :default && "gap-2"
          ]}>
            <span class="flex items-start justify-between gap-2">
              <span class={[
                "line-clamp-2 font-bold leading-tight drop-shadow",
                @variant == :compact && "text-xs",
                @variant == :default && "text-sm"
              ]}>
                {@card_name}
              </span>
              <span
                :if={@variant == :default}
                class="badge badge-primary badge-sm shrink-0 font-bold"
              >
                ×{@quantity}
              </span>
            </span>
            <span class="flex items-center justify-between gap-2 text-xs">
              <span class="badge badge-sm border-white/30 bg-black/45 text-white backdrop-blur-sm">
                <.set_icon
                  set_code={@set_code}
                  rarity={@set_rarity}
                  class="h-4 w-4"
                  fallback_class="text-[0.65rem]"
                />
              </span>
              <span :if={@price_text && @variant == :default} class="font-mono text-white/90">
                {@price_text}
              </span>
            </span>
          </span>
        </button>

        <span
          :if={@current}
          class="absolute top-2 right-2 z-20 badge badge-primary badge-sm font-bold shadow"
        >
          Current
        </span>

        <span
          :if={@quantity > 1}
          class="absolute top-2 left-2 z-20 badge badge-primary badge-sm font-bold shadow"
        >
          ×{@quantity}
        </span>
      </figure>
    </div>
    """
  end

  def card_name(%CollectionItem{printing: %{card: %{name: name}}}), do: name
  def card_name(%DeckCard{card: %{name: name}}), do: name

  def card_name(%ScanItem{} = item),
    do: item |> tile_printing() |> printing_card_name() || "Scan item ##{item.id}"

  def card_name(%Printing{} = printing), do: printing_card_name(printing) || "Unknown card"
  def card_name(_item), do: "Unknown card"

  def set_label(%CollectionItem{
        printing: %{set_code: set_code, collector_number: collector_number}
      }) do
    "#{String.upcase(set_code)} ##{collector_number}"
  end

  def set_label(%DeckCard{} = item), do: item |> tile_printing() |> printing_set_label()
  def set_label(%ScanItem{} = item), do: item |> tile_printing() |> printing_set_label()
  def set_label(%Printing{} = printing), do: printing_set_label(printing)

  def set_code(%CollectionItem{printing: %{set_code: set_code}}) when is_binary(set_code),
    do: String.upcase(set_code)

  def set_code(%DeckCard{} = item), do: item |> tile_printing() |> printing_set_code()
  def set_code(%ScanItem{} = item), do: item |> tile_printing() |> printing_set_code()
  def set_code(%Printing{} = printing), do: printing_set_code(printing)
  def set_code(_item), do: "?"

  def set_rarity(%CollectionItem{printing: %{rarity: rarity}}), do: rarity
  def set_rarity(%DeckCard{} = item), do: item |> tile_printing() |> printing_rarity()
  def set_rarity(%ScanItem{} = item), do: item |> tile_printing() |> printing_rarity()
  def set_rarity(%Printing{} = printing), do: printing_rarity(printing)
  def set_rarity(_item), do: nil

  def price_text(%CollectionItem{} = item), do: Price.text_for_collection_item(item)
  def price_text(%DeckCard{} = item), do: Price.text_for_deck_card(item)
  def price_text(%ScanItem{} = item), do: item |> tile_printing() |> printing_price_text()
  def price_text(%Printing{} = printing), do: Price.text_for_printing(printing)
  def price_text(_item), do: nil

  def item_image_url(%CollectionItem{printing: printing}), do: printing_image_url(printing)
  def item_image_url(%DeckCard{} = item), do: item |> tile_printing() |> printing_image_url()
  def item_image_url(%ScanItem{} = item), do: item |> tile_printing() |> printing_image_url()
  def item_image_url(%Printing{} = printing), do: printing_image_url(printing)
  def item_image_url(_item), do: nil

  defp default_id(%CollectionItem{id: id}), do: "collection-item-#{id}"
  defp default_id(%DeckCard{id: id}), do: "deck-card-#{id}"
  defp default_id(%ScanItem{id: id}), do: "scan-item-#{id}"
  defp default_id(%Printing{scryfall_id: id}), do: "printing-#{id}"
  defp default_id(_item), do: nil

  defp item_click_id(%CollectionItem{id: id}), do: id
  defp item_click_id(%DeckCard{id: id}), do: id
  defp item_click_id(%ScanItem{id: id}), do: id
  defp item_click_id(_item), do: nil

  defp item_quantity(%{quantity: quantity}) when is_integer(quantity), do: quantity
  defp item_quantity(_item), do: 1

  defp item_finish(%{finish: finish}) when is_binary(finish), do: finish
  defp item_finish(_item), do: nil

  defp foil_finish?(finish), do: finish in ["foil", "etched"]

  defp finish_label("etched"), do: "Etched"
  defp finish_label("foil"), do: "Foil"

  defp tile_printing(%DeckCard{preferred_printing: %Printing{} = printing}), do: printing
  defp tile_printing(%DeckCard{card: %{printings: [%Printing{} = printing | _]}}), do: printing
  defp tile_printing(%DeckCard{}), do: nil
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

  defp printing_rarity(%Printing{rarity: rarity}), do: rarity
  defp printing_rarity(_printing), do: nil

  defp printing_price_text(%Printing{} = printing), do: Price.text_for_printing(printing)
  defp printing_price_text(_printing), do: nil

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
end
