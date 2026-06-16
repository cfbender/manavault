defmodule ManavaultWeb.CollectionLive do
  use ManavaultWeb, :live_view

  import ManavaultWeb.CardTile, only: [card_tile: 1]

  alias Manavault.Catalog
  alias Manavault.Catalog.{CollectionItem, Printing}

  @conditions [
    {"Any condition", ""},
    {"Near mint", "near_mint"},
    {"Lightly played", "lightly_played"},
    {"Moderately played", "moderately_played"},
    {"Heavily played", "heavily_played"},
    {"Damaged", "damaged"}
  ]

  @finishes [
    {"Any finish", ""},
    {"Nonfoil", "nonfoil"},
    {"Foil", "foil"},
    {"Etched", "etched"}
  ]

  @collection_page_size 24

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Collection")
     |> assign(:locations, [])
     |> assign(:items, [])
     |> assign(:has_more_items, false)
     |> assign(:filters, %{})
     |> assign(:selected_item, nil)
     |> assign(:change_printing_item, nil)
     |> assign(:change_printing_options, [])
     |> assign(:condition_options, @conditions)
     |> assign(:finish_options, @finishes)
     |> assign(:filter_form, to_form(%{"q" => ""}, as: :filters))}
  end

  @impl true
  def handle_params(params, _uri, socket) do
    filters = filter_params(params)
    locations = Catalog.list_locations()
    {items, has_more_items} = list_collection_page(filters, 0)

    {:noreply,
     socket
     |> assign(:locations, locations)
     |> assign(:items, items)
     |> assign(:has_more_items, has_more_items)
     |> assign(:filters, filters)
     |> assign(:filter_form, to_form(filter_form_params(filters), as: :filters))}
  end

  @impl true
  def handle_event("filter", %{"filters" => params}, socket) do
    filters = filter_params(params)

    {:noreply, push_patch(socket, to: ~p"/collection?#{filters}")}
  end

  @impl true
  def handle_event("load-more", _params, socket) do
    if socket.assigns.has_more_items do
      offset = length(socket.assigns.items)
      {items, has_more_items} = list_collection_page(socket.assigns.filters, offset)

      {:noreply,
       socket
       |> assign(:items, socket.assigns.items ++ items)
       |> assign(:has_more_items, has_more_items)}
    else
      {:noreply, socket}
    end
  end

  @impl true
  def handle_event("show_details", %{"id" => id}, socket) do
    item = Enum.find(socket.assigns.items, &(to_string(&1.id) == id))
    {:noreply, assign(socket, :selected_item, item)}
  end

  @impl true
  def handle_event("change_printing", %{"id" => id}, socket) do
    item = Enum.find(socket.assigns.items, &(to_string(&1.id) == id))
    options = if item, do: Catalog.list_printings_for_collection_item(item), else: []

    {:noreply,
     socket
     |> assign(:selected_item, nil)
     |> assign(:change_printing_item, item)
     |> assign(:change_printing_options, options)}
  end

  @impl true
  def handle_event("switch_printing", %{"id" => id, "scryfall_id" => scryfall_id}, socket) do
    item = Catalog.get_collection_item!(id)

    case Catalog.switch_collection_item_printing(item, scryfall_id) do
      {:ok, _item} ->
        {:noreply,
         socket
         |> put_flash(:info, "Changed printing for #{card_name(item)}.")
         |> refresh_collection_items()
         |> assign(:change_printing_item, nil)
         |> assign(:change_printing_options, [])}

      {:error, _changeset} ->
        {:noreply, put_flash(socket, :error, "Could not change printing.")}
    end
  end

  @impl true
  def handle_event("close_modal", _params, socket) do
    {:noreply,
     socket
     |> assign(:selected_item, nil)
     |> assign(:change_printing_item, nil)
     |> assign(:change_printing_options, [])}
  end

  @impl true
  def handle_event("delete", %{"id" => id}, socket) do
    item = Catalog.get_collection_item!(id)
    {:ok, _} = Catalog.delete_collection_item(item)

    {:noreply,
     socket
     |> put_flash(:info, "Removed #{card_name(item)} from your collection.")
     |> refresh_collection_items()
     |> assign(:selected_item, nil)
     |> assign(:change_printing_item, nil)
     |> assign(:change_printing_options, [])}
  end

  @impl true
  def handle_event("delete_location", %{"id" => id}, socket) do
    location = Catalog.get_location!(id)
    {:ok, _} = Catalog.delete_location(location)

    locations = Catalog.list_locations()

    {:noreply,
     socket
     |> put_flash(:info, "Removed #{location.name}.")
     |> assign(:locations, locations)}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="space-y-8">
        <section class="card border border-base-300 bg-base-200 shadow-xl">
          <div class="card-body gap-6 p-6 sm:p-8">
            <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div class="max-w-3xl space-y-3">
                <div class="badge badge-primary badge-outline font-semibold uppercase tracking-wide">
                  ManaVault inventory
                </div>
                <h1 class="text-4xl font-black tracking-tight sm:text-5xl">Collection</h1>
                <p class="text-base leading-7 text-base-content/70">
                  Your boxes, binders, lists, and owned printings.
                </p>
              </div>
              <div class="flex gap-2">
                <.link navigate={~p"/cards"} class="btn btn-outline">Find cards</.link>
                <.link navigate={~p"/collection/new"} class="btn btn-primary">Add location</.link>
              </div>
            </div>
          </div>
        </section>

        <section class="space-y-4">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-xl font-bold tracking-tight">Locations</h2>
            <span class="badge badge-ghost">{length(@locations)} total</span>
          </div>

          <div :if={@locations == []} class="alert border border-info/20 bg-info/10 text-info-content">
            <span>No locations yet. Add a box, binder, or list to start organizing your collection.</span>
          </div>

          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <.link
              :for={loc <- @locations}
              navigate={~p"/collection/locations/#{loc.id}"}
              class="group card overflow-hidden border border-base-300 bg-base-100 shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
            >
              <div class="card-body gap-3 p-5">
                <div class="flex items-start justify-between gap-2">
                  <span class="text-3xl">{kind_icon(loc.kind)}</span>
                  <span class="badge badge-outline badge-sm">{humanize_kind(loc.kind)}</span>
                </div>
                <div>
                  <h3 class="text-lg font-bold leading-snug">{loc.name}</h3>
                  <p :if={loc.description} class="mt-1 text-sm text-base-content/60 line-clamp-2">
                    {loc.description}
                  </p>
                </div>
                <div class="flex items-center justify-between text-sm text-base-content/60">
                  <span>{length(loc.collection_items)} cards</span>
                  <span class="text-primary opacity-0 transition group-hover:opacity-100">
                    View →
                  </span>
                </div>
              </div>
            </.link>
          </div>
        </section>

        <section class="space-y-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-xl font-bold tracking-tight">Owned cards</h2>
              <p class="text-sm text-base-content/60">
                Search and filter every collection item across all locations.
              </p>
            </div>
            <span class="badge badge-ghost">{length(@items)} items</span>
          </div>

          <.form
            for={@filter_form}
            id="collection-filter-form"
            phx-submit="filter"
            class="rounded-box border border-base-300 bg-base-100 p-4 shadow-sm"
          >
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-6 xl:items-end">
              <.input
                field={@filter_form[:q]}
                type="search"
                label="Search"
                placeholder="Card, set, collector #, Scryfall ID"
              />
              <.input
                field={@filter_form[:condition]}
                type="select"
                label="Condition"
                options={@condition_options}
              />
              <.input
                field={@filter_form[:language]}
                type="text"
                label="Language"
                placeholder="en"
              />
              <.input
                field={@filter_form[:finish]}
                type="select"
                label="Finish"
                options={@finish_options}
              />
              <.input
                field={@filter_form[:location_id]}
                type="select"
                label="Location"
                options={location_filter_options(@locations)}
              />
              <div class="fieldset mb-2">
                <span class="label mb-1 hidden xl:block">&nbsp;</span>
                <button class="btn btn-primary w-full" type="submit">Filter</button>
              </div>
            </div>
          </.form>

          <div :if={@items == []} class="alert border border-info/20 bg-info/10 text-info-content">
            <span>No collection items matched those filters.</span>
          </div>

          <div
            :if={@items != []}
            id="owned-card-grid"
            class="grid grid-cols-[repeat(auto-fit,minmax(10.5rem,13.5rem))] justify-center gap-5"
          >
            <.card_tile
              :for={item <- @items}
              item={item}
              selected_item={@selected_item}
              change_printing_item={@change_printing_item}
            />
          </div>

          <div :if={@has_more_items} class="flex justify-center py-2">
            <button
              id="load-more-owned-cards"
              type="button"
              class="btn btn-outline"
              phx-click="load-more"
              phx-viewport-bottom="load-more"
            >
              Load more
            </button>
          </div>
        </section>

        <dialog
          :if={@selected_item}
          id="collection-item-modal"
          class="modal modal-open"
          phx-click-away="close_modal"
          phx-key="Escape"
        >
          <div class="modal-box max-w-md">
            <div class="flex gap-4">
              <img
                :if={item_image_url(@selected_item)}
                src={item_image_url(@selected_item)}
                alt={card_name(@selected_item)}
                class="w-28 h-40 shrink-0 rounded-lg shadow object-cover"
              />
              <div class="space-y-3 flex-1">
                <h3 class="text-lg font-bold">{card_name(@selected_item)}</h3>
                <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt class="font-semibold">Printing</dt>
                  <dd>{set_label(@selected_item)}</dd>
                  <dt class="font-semibold">Quantity</dt>
                  <dd>{@selected_item.quantity}</dd>
                  <dt class="font-semibold">Condition</dt>
                  <dd>{humanize_value(@selected_item.condition)}</dd>
                  <dt class="font-semibold">Language</dt>
                  <dd>{@selected_item.language}</dd>
                  <dt class="font-semibold">Finish</dt>
                  <dd>{@selected_item.finish}</dd>
                  <dt :if={price_text(@selected_item)} class="font-semibold">Price</dt>
                  <dd :if={price_text(@selected_item)}>{price_text(@selected_item)}</dd>
                  <dt class="font-semibold">Scryfall ID</dt>
                  <dd class="break-all text-xs">{@selected_item.scryfall_id}</dd>
                </dl>
              </div>
            </div>
            <div class="modal-action">
              <.link
                navigate={~p"/collection/#{@selected_item.id}/edit"}
                class="btn btn-sm btn-primary"
              >
                Edit
              </.link>
              <button class="btn btn-sm" phx-click="close_modal">Close</button>
            </div>
          </div>
          <form method="dialog" class="modal-backdrop">
            <button phx-click="close_modal">close</button>
          </form>
        </dialog>

        <dialog
          :if={@change_printing_item}
          id="change-printing-modal"
          class="modal modal-open"
          phx-click-away="close_modal"
          phx-key="Escape"
        >
          <div class="modal-box max-w-3xl">
            <div class="space-y-2">
              <h3 class="text-xl font-bold">Change printing</h3>
              <p class="text-sm text-base-content/70">
                Choose a different printing for {card_name(@change_printing_item)}.
              </p>
            </div>

            <div class="mt-5 max-h-[68vh] overflow-y-auto pr-1">
              <div class="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(8rem,1fr))]">
                <.card_tile
                  :for={printing <- @change_printing_options}
                  item={printing}
                  menu={:none}
                  variant={:compact}
                  details_event="switch_printing"
                  click_value_id={@change_printing_item.id}
                  click_value_scryfall_id={printing.scryfall_id}
                  click_disabled={printing.scryfall_id == @change_printing_item.scryfall_id}
                  current={printing.scryfall_id == @change_printing_item.scryfall_id}
                />
              </div>
            </div>

            <p :if={@change_printing_options == []} class="alert alert-info mt-5">
              No alternate printings found for this card.
            </p>

            <div class="modal-action">
              <button class="btn btn-sm" phx-click="close_modal">Cancel</button>
            </div>
          </div>
          <form method="dialog" class="modal-backdrop">
            <button phx-click="close_modal">close</button>
          </form>
        </dialog>
      </div>
    </Layouts.app>
    """
  end

  defp filter_params(params) when is_map(params) do
    params
    |> Map.take(["q", "condition", "language", "finish", "location_id"])
    |> Enum.map(fn {key, value} -> {key, normalize_filter_value(value)} end)
    |> Enum.reject(fn {_key, value} -> value == "" end)
    |> Map.new()
  end

  defp list_collection_page(filters, offset) do
    items =
      Catalog.list_collection_items(filter_keywords(filters),
        limit: @collection_page_size + 1,
        offset: offset
      )

    {Enum.take(items, @collection_page_size), length(items) > @collection_page_size}
  end

  defp refresh_collection_items(socket) do
    loaded_count = max(length(socket.assigns.items), @collection_page_size)

    items =
      Catalog.list_collection_items(filter_keywords(socket.assigns.filters),
        limit: loaded_count + 1,
        offset: 0
      )

    socket
    |> assign(:items, Enum.take(items, loaded_count))
    |> assign(:has_more_items, length(items) > loaded_count)
  end

  defp filter_keywords(filters) do
    filters
    |> Enum.map(fn {key, value} -> {String.to_existing_atom(key), value} end)
  end

  defp filter_form_params(filters) do
    %{"q" => "", "condition" => "", "language" => "", "finish" => "", "location_id" => ""}
    |> Map.merge(filters)
  end

  defp normalize_filter_value(value) when is_binary(value), do: String.trim(value)
  defp normalize_filter_value(_value), do: ""

  defp location_filter_options(locations) do
    [{"Any location", ""}, {"Unfiled", "unfiled"}] ++
      Enum.map(locations, fn loc -> {"#{kind_icon(loc.kind)} #{loc.name}", loc.id} end)
  end

  defp card_name(%CollectionItem{printing: %{card: %{name: name}}}), do: name
  defp card_name(_item), do: "Unknown card"

  defp set_label(%CollectionItem{
         printing: %{set_code: set_code, collector_number: collector_number}
       }) do
    "#{String.upcase(set_code)} ##{collector_number}"
  end

  defp price_text(%CollectionItem{printing: %Printing{prices: prices}}) do
    price_text_from_prices(prices)
  end

  defp price_text(_item), do: nil

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

  defp item_image_url(%CollectionItem{printing: printing}), do: printing_image_url(printing)
  defp item_image_url(_item), do: nil

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

  defp humanize_kind(kind) when is_binary(kind) do
    kind |> String.replace("_", " ") |> String.capitalize()
  end

  defp kind_icon("box"), do: "📦"
  defp kind_icon("binder"), do: "📒"
  defp kind_icon("deck_box"), do: "🎴"
  defp kind_icon("list"), do: "📋"
  defp kind_icon("folder"), do: "📁"
  defp kind_icon(_), do: "📌"

  defp humanize_value(value) when is_binary(value) do
    value
    |> String.replace("_", " ")
    |> String.capitalize()
  end

  defp humanize_value(value), do: value
end
