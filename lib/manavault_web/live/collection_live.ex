defmodule ManavaultWeb.CollectionLive do
  use ManavaultWeb, :live_view

  import ManavaultWeb.CardTile, only: [card_tile: 1]

  alias Manavault.Catalog
  alias Manavault.Catalog.{CollectionItem, Location, Printing}

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
     |> assign(:editing_location, nil)
     |> assign(:location_form, nil)
     |> assign(:location_cover_options, [])
     |> assign(:location_cover_query, "")
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
  def handle_info({:card_name_autocomplete, "location-cover-card-autocomplete", query}, socket) do
    query = String.trim(query || "")

    {:noreply,
     socket
     |> assign(:location_cover_query, query)
     |> assign(
       :location_cover_options,
       location_cover_options(query, socket.assigns.editing_location)
     )}
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
     |> assign(:change_printing_options, [])
     |> assign(:editing_location, nil)
     |> assign(:location_form, nil)
     |> assign(:location_cover_options, [])
     |> assign(:location_cover_query, "")}
  end

  @impl true
  def handle_event("edit_location", %{"id" => id}, socket) do
    location = Catalog.get_location!(id)

    {:noreply,
     socket
     |> assign(:selected_item, nil)
     |> assign(:change_printing_item, nil)
     |> assign(:change_printing_options, [])
     |> assign(:editing_location, location)
     |> assign(:location_form, location_form(location))
     |> assign(:location_cover_options, selected_location_cover_option(location))
     |> assign(:location_cover_query, "")}
  end

  @impl true
  def handle_event("search_location_cover", %{"cover" => %{"q" => query}}, socket) do
    query = String.trim(query || "")

    {:noreply,
     socket
     |> assign(:location_cover_query, query)
     |> assign(
       :location_cover_options,
       location_cover_options(query, socket.assigns.editing_location)
     )}
  end

  @impl true
  def handle_event("validate_location", %{"location" => params}, socket) do
    form =
      socket.assigns.editing_location
      |> Catalog.change_location(normalize_location_params(params))
      |> Map.put(:action, :validate)
      |> to_form()

    {:noreply, assign(socket, :location_form, form)}
  end

  @impl true
  def handle_event("save_location", %{"location" => params}, socket) do
    case Catalog.update_location(
           socket.assigns.editing_location,
           normalize_location_params(params)
         ) do
      {:ok, location} ->
        {:noreply,
         socket
         |> put_flash(:info, "Updated #{location.name}.")
         |> assign(:locations, Catalog.list_locations())
         |> assign(:editing_location, nil)
         |> assign(:location_form, nil)
         |> assign(:location_cover_options, [])
         |> assign(:location_cover_query, "")}

      {:error, changeset} ->
        {:noreply, assign(socket, :location_form, to_form(changeset))}
    end
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
      <div class="relative left-1/2 w-[min(calc(100vw-2rem),80rem)] -translate-x-1/2 space-y-8">
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

          <div class="grid gap-4">
            <div
              :for={loc <- @locations}
              id={"location-row-#{loc.id}"}
              class="group overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm transition hover:border-primary/40 hover:shadow-xl"
            >
              <div class="grid gap-0 md:grid-cols-[13rem_1fr]">
                <.link
                  navigate={~p"/collection/locations/#{loc.id}"}
                  class="relative block aspect-[16/10] bg-base-300 md:aspect-auto"
                >
                  <img
                    :if={location_cover_url(loc)}
                    src={location_cover_url(loc)}
                    alt=""
                    class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.015]"
                  />
                  <div
                    :if={!location_cover_url(loc)}
                    class="grid h-full w-full place-items-center text-5xl text-base-content/45"
                  >
                    {kind_icon(loc.kind)}
                  </div>
                </.link>

                <div class="flex flex-col gap-4 p-5 sm:p-6">
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <.link navigate={~p"/collection/locations/#{loc.id}"} class="min-w-0 space-y-2">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="badge badge-outline badge-sm">{humanize_kind(loc.kind)}</span>
                        <span class="text-sm text-base-content/60">
                          {length(loc.collection_items)} cards
                        </span>
                      </div>
                      <div>
                        <h3 class="text-2xl font-black leading-tight tracking-tight">{loc.name}</h3>
                        <p
                          :if={loc.description}
                          class="mt-1 text-sm leading-6 text-base-content/60"
                        >
                          {loc.description}
                        </p>
                      </div>
                    </.link>

                    <div class="flex shrink-0 gap-2">
                      <button
                        type="button"
                        class="btn btn-outline btn-sm"
                        phx-click="edit_location"
                        phx-value-id={loc.id}
                      >
                        Edit
                      </button>
                      <.link
                        navigate={~p"/collection/locations/#{loc.id}"}
                        class="btn btn-primary btn-sm"
                      >
                        View
                      </.link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
            <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div class="min-w-0 flex-1">
                <.live_component
                  module={ManavaultWeb.CardNameAutocomplete}
                  id="collection-filter-card-autocomplete"
                  field={@filter_form[:q]}
                  label="Search"
                  placeholder="Card, set, collector #, Scryfall ID"
                />
              </div>

              <div class="flex shrink-0 items-end gap-2 pb-0">
                <details class="dropdown dropdown-end">
                  <summary
                    class="btn btn-outline relative"
                    aria-label="More filters"
                    title="More filters"
                  >
                    <.icon name="hero-funnel" class="size-5" />
                    <span
                      :if={extra_filter_count(@filters) > 0}
                      class="badge badge-primary badge-xs absolute -right-1 -top-1"
                    >
                      {extra_filter_count(@filters)}
                    </span>
                  </summary>
                  <div class="dropdown-content z-30 w-[min(calc(100vw-2rem),24rem)] rounded-box border border-base-300 bg-base-100 p-4 shadow-2xl">
                    <div class="grid gap-3 sm:grid-cols-2">
                      <.input
                        field={@filter_form[:condition]}
                        type="select"
                        label="Condition"
                        options={@condition_options}
                      />
                      <.input
                        field={@filter_form[:finish]}
                        type="select"
                        label="Finish"
                        options={@finish_options}
                      />
                      <.input
                        field={@filter_form[:language]}
                        type="text"
                        label="Language"
                        placeholder="en"
                      />
                      <.input
                        field={@filter_form[:location_id]}
                        type="select"
                        label="Location"
                        options={location_filter_options(@locations)}
                      />
                    </div>
                  </div>
                </details>

                <button class="btn btn-primary px-6" type="submit">Search</button>
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
      </div>

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

      <div
        :if={@editing_location}
        id="location-edit-modal"
        class="fixed inset-0 z-50 grid h-screen w-screen place-items-center overflow-hidden bg-black/65 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-edit-title"
        phx-window-keydown="close_modal"
        phx-key="Escape"
      >
        <button
          type="button"
          class="absolute inset-0 cursor-default"
          aria-label="Close location editor"
          phx-click="close_modal"
        />

        <div class="relative z-10 flex h-[min(48rem,calc(100vh-4rem))] w-[min(calc(100vw-2rem),56rem)] max-w-none flex-col overflow-hidden rounded-box border border-base-300 bg-base-100 p-0 shadow-2xl ring-1 ring-white/10">
          <div class="sticky top-0 z-20 flex shrink-0 flex-col gap-3 border-b border-base-300 bg-base-200/95 px-6 py-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 id="location-edit-title" class="text-xl font-bold">Edit location</h3>
              <p class="text-sm text-base-content/70">
                Search for any card to choose cover art.
              </p>
            </div>
            <div class="flex shrink-0 gap-2">
              <button class="btn btn-ghost btn-sm" type="button" phx-click="close_modal">
                Cancel
              </button>
              <button class="btn btn-primary btn-sm" type="submit" form="location-edit-form">
                Save
              </button>
            </div>
          </div>

          <.form
            for={@location_form}
            id="location-edit-form"
            as={:location}
            phx-change="validate_location"
            phx-submit="save_location"
            class="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div class="min-h-0 flex-1 space-y-4 overflow-y-auto bg-base-100 px-6 py-5">
              <div class="grid gap-3 sm:grid-cols-2">
                <.input field={@location_form[:name]} type="text" label="Name" required />
                <.input
                  field={@location_form[:kind]}
                  type="select"
                  label="Kind"
                  options={location_kind_options()}
                />
              </div>

              <.input field={@location_form[:description]} type="textarea" label="Description" />

              <div class="space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <h4 class="font-semibold">Cover image</h4>
                  <label class="inline-flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      class="radio radio-sm"
                      name="location[cover_scryfall_id]"
                      value=""
                      checked={blank_cover?(@location_form)}
                    /> None
                  </label>
                </div>

                <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <.live_component
                    module={ManavaultWeb.CardNameAutocomplete}
                    id="location-cover-card-autocomplete"
                    name="cover[q]"
                    value={@location_cover_query}
                    label="Search card art"
                    placeholder="Black Lotus"
                    notify_parent
                  />
                </div>

                <div
                  :if={@location_cover_options == [] and @location_cover_query == ""}
                  class="alert border border-info/20 bg-info/10 text-sm"
                >
                  <span>Search for any card to choose cover art.</span>
                </div>

                <div
                  :if={@location_cover_options == [] and @location_cover_query != ""}
                  class="alert border border-info/20 bg-info/10 text-sm"
                >
                  <span>No card art matched that search.</span>
                </div>

                <div
                  :if={@location_cover_options != []}
                  class="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3 pr-1 sm:grid-cols-[repeat(auto-fill,minmax(8rem,1fr))]"
                >
                  <label
                    :for={item <- @location_cover_options}
                    class={[
                      "relative cursor-pointer rounded-xl border border-base-300 bg-base-200 p-1 transition hover:border-primary/50",
                      cover_selected?(@location_form, item.scryfall_id) &&
                        "border-primary ring-2 ring-primary/60"
                    ]}
                  >
                    <input
                      type="radio"
                      class="sr-only"
                      name="location[cover_scryfall_id]"
                      value={item.scryfall_id}
                      checked={cover_selected?(@location_form, item.scryfall_id)}
                    />
                    <img
                      :if={item_art_url(item)}
                      src={item_art_url(item)}
                      alt={card_name(item)}
                      class="aspect-[16/9] w-full rounded-lg object-cover"
                    />
                    <div
                      :if={!item_art_url(item)}
                      class="grid aspect-[16/9] w-full place-items-center rounded-lg bg-base-300 p-3 text-center text-xs text-base-content/50"
                    >
                      No image
                    </div>
                    <div class="p-2 text-xs">
                      <p class="line-clamp-2 font-semibold leading-tight">{card_name(item)}</p>
                      <p class="mt-1 text-base-content/60">{set_label(item)}</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </.form>
        </div>
      </div>
    </Layouts.app>
    """
  end

  defp location_form(%Location{} = location) do
    location
    |> Catalog.change_location()
    |> to_form()
  end

  defp location_cover_options("", %Location{} = location),
    do: selected_location_cover_option(location)

  defp location_cover_options(query, %Location{} = location) do
    query
    |> then(&Catalog.search_printings([name: &1], limit: 30))
    |> include_selected_cover(location)
  end

  defp selected_location_cover_option(%Location{cover_scryfall_id: scryfall_id})
       when is_binary(scryfall_id) do
    case Catalog.get_printing_by_scryfall_id(scryfall_id) do
      %Printing{} = printing -> [printing]
      nil -> []
    end
  end

  defp selected_location_cover_option(_location), do: []

  defp include_selected_cover(options, %Location{} = location) do
    (selected_location_cover_option(location) ++ options)
    |> Enum.uniq_by(& &1.scryfall_id)
  end

  defp normalize_location_params(%{"cover_scryfall_id" => ""} = params) do
    Map.put(params, "cover_scryfall_id", nil)
  end

  defp normalize_location_params(params), do: params

  defp blank_cover?(form), do: form[:cover_scryfall_id].value in [nil, ""]

  defp cover_selected?(form, scryfall_id) do
    to_string(form[:cover_scryfall_id].value || "") == to_string(scryfall_id)
  end

  defp location_cover_url(%{cover_printing: %Printing{} = printing}),
    do: printing_art_url(printing)

  defp location_cover_url(_location), do: nil

  defp location_kind_options do
    [
      {"Box", "box"},
      {"Binder", "binder"},
      {"Deck box", "deck_box"},
      {"List", "list"},
      {"Folder", "folder"},
      {"Other", "other"}
    ]
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

  defp extra_filter_count(filters) do
    Enum.count(["condition", "language", "finish", "location_id"], fn key ->
      Map.get(filters, key, "") != ""
    end)
  end

  defp normalize_filter_value(value) when is_binary(value), do: String.trim(value)
  defp normalize_filter_value(_value), do: ""

  defp location_filter_options(locations) do
    [{"Any location", ""}, {"Unfiled", "unfiled"}] ++
      Enum.map(locations, fn loc -> {"#{kind_icon(loc.kind)} #{loc.name}", loc.id} end)
  end

  defp card_name(%CollectionItem{printing: %{card: %{name: name}}}), do: name
  defp card_name(%Printing{card: %{name: name}}), do: name
  defp card_name(_item), do: "Unknown card"

  defp set_label(%CollectionItem{
         printing: %{set_code: set_code, collector_number: collector_number}
       }) do
    "#{String.upcase(set_code)} ##{collector_number}"
  end

  defp set_label(%Printing{set_code: set_code, collector_number: collector_number}) do
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
  defp item_image_url(%Printing{} = printing), do: printing_image_url(printing)
  defp item_image_url(_item), do: nil

  defp item_art_url(%CollectionItem{printing: printing}), do: printing_art_url(printing)
  defp item_art_url(%Printing{} = printing), do: printing_art_url(printing)
  defp item_art_url(_item), do: nil

  defp printing_image_url(%Printing{image_uris: image_uris}) do
    with {:ok, uris} <- Jason.decode(image_uris) do
      image_url_from_uris(uris, :card)
    else
      _ -> nil
    end
  end

  defp printing_image_url(_printing), do: nil

  defp printing_art_url(%Printing{image_uris: image_uris}) do
    with {:ok, uris} <- Jason.decode(image_uris) do
      image_url_from_uris(uris, :art)
    else
      _ -> nil
    end
  end

  defp printing_art_url(_printing), do: nil

  defp image_url_from_uris(uris, variant) when is_map(uris) do
    variant
    |> preferred_image_keys()
    |> Enum.find_value(&Map.get(uris, &1))
  end

  defp image_url_from_uris([uris | _], variant), do: image_url_from_uris(uris, variant)
  defp image_url_from_uris(_uris, _variant), do: nil

  defp preferred_image_keys(:art), do: ["art_crop", "normal", "large", "small", "png"]
  defp preferred_image_keys(_variant), do: ["normal", "large", "small", "png", "art_crop"]

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
