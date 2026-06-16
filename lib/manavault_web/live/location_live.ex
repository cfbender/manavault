defmodule ManavaultWeb.LocationLive do
  use ManavaultWeb, :live_view

  alias Manavault.Catalog
  alias Manavault.Catalog.{CollectionItem, Printing}

  @impl true
  def mount(%{"id" => id}, _session, socket) do
    location = Catalog.get_location_with_items!(id)

    {:ok,
     socket
     |> assign(:page_title, location.name)
     |> assign(:location, location)
     |> assign(:items, location.collection_items)
     |> assign(:selected_item, nil)
     |> assign(:change_printing_item, nil)
     |> assign(:change_printing_options, [])
     |> assign(:search_form, to_form(%{"q" => ""}, as: :search))}
  end

  @impl true
  def handle_event("search", %{"search" => %{"q" => query}}, socket) do
    query = String.trim(query)

    items =
      Catalog.list_collection_items_by_location(socket.assigns.location.id, q: query)

    {:noreply,
     socket
     |> assign(:search_form, to_form(%{"q" => query}, as: :search))
     |> assign(:items, items)}
  end

  def handle_event("show_details", %{"id" => id}, socket) do
    item = Enum.find(socket.assigns.items, &(to_string(&1.id) == id))
    {:noreply, assign(socket, :selected_item, item)}
  end

  def handle_event("change_printing", %{"id" => id}, socket) do
    item = Enum.find(socket.assigns.items, &(to_string(&1.id) == id))
    options = if item, do: Catalog.list_printings_for_collection_item(item), else: []

    {:noreply,
     socket
     |> assign(:selected_item, nil)
     |> assign(:change_printing_item, item)
     |> assign(:change_printing_options, options)}
  end

  def handle_event("switch_printing", %{"id" => id, "scryfall_id" => scryfall_id}, socket) do
    item = Catalog.get_collection_item!(id)

    case Catalog.switch_collection_item_printing(item, scryfall_id) do
      {:ok, _item} ->
        location = Catalog.get_location_with_items!(socket.assigns.location.id)

        {:noreply,
         socket
         |> put_flash(:info, "Changed printing for #{card_name(item)}.")
         |> assign(:location, location)
         |> assign(:items, location.collection_items)
         |> assign(:change_printing_item, nil)
         |> assign(:change_printing_options, [])}

      {:error, _changeset} ->
        {:noreply, put_flash(socket, :error, "Could not change printing.")}
    end
  end

  def handle_event("close_modal", _params, socket) do
    {:noreply,
     socket
     |> assign(:selected_item, nil)
     |> assign(:change_printing_item, nil)
     |> assign(:change_printing_options, [])}
  end

  def handle_event("delete", %{"id" => id}, socket) do
    item = Catalog.get_collection_item!(id)
    {:ok, _} = Catalog.delete_collection_item(item)

    location = Catalog.get_location_with_items!(socket.assigns.location.id)

    {:noreply,
     socket
     |> put_flash(:info, "Removed #{card_name(item)} from #{location.name}.")
     |> assign(:location, location)
     |> assign(:items, location.collection_items)
     |> assign(:selected_item, nil)
     |> assign(:change_printing_item, nil)
     |> assign(:change_printing_options, [])}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="space-y-6">
        <.back_link navigate={~p"/collection"}>Back to collection</.back_link>

        <section class="card border border-base-300 bg-base-200 shadow-xl">
          <div class="card-body gap-4 p-6 sm:p-8">
            <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div class="space-y-2">
                <div class="flex items-center gap-3">
                  <span class="text-3xl">{kind_icon(@location.kind)}</span>
                  <div>
                    <h1 class="text-3xl font-black tracking-tight sm:text-4xl">{@location.name}</h1>
                    <span class="badge badge-outline badge-sm mt-1">{humanize_kind(@location.kind)}</span>
                  </div>
                </div>
                <p :if={@location.description} class="text-base text-base-content/70">
                  {@location.description}
                </p>
              </div>
              <div class="flex gap-2">
                <.link navigate={~p"/cards"} class="btn btn-outline btn-sm">Find cards</.link>
                <.link
                  :if={@items != []}
                  navigate={~p"/collection/new"}
                  class="btn btn-primary btn-sm"
                >
                  Add card
                </.link>
              </div>
            </div>

            <.form
              :if={@location.collection_items != []}
              for={@search_form}
              id="location-search-form"
              phx-submit="search"
              class="rounded-box border border-base-300 bg-base-100 p-3 shadow-sm"
            >
              <div class="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <div class="fieldset mb-2">
                  <span class="label mb-1">
                    <span class="label-text">Search</span>
                  </span>
                  <input
                    type="search"
                    name={@search_form[:q].name}
                    value={@search_form[:q].value}
                    class="input input-bordered w-full"
                    placeholder="Card name, set, collector #"
                    autocomplete="off"
                  />
                </div>
                <div class="fieldset mb-2">
                  <span class="label mb-1 hidden md:block">&nbsp;</span>
                  <button class="btn btn-primary btn-sm w-full md:w-auto" type="submit">Search</button>
                </div>
              </div>
            </.form>
          </div>
        </section>

        <section class="space-y-3">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-xl font-bold tracking-tight">Cards</h2>
            <span class="badge badge-ghost">{length(@items)} cards</span>
          </div>

          <div class="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            <div
              :for={item <- @items}
              id={"collection-item-#{item.id}"}
              class="group card relative overflow-visible border border-base-300 bg-base-100 shadow-sm transition hover:z-50 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
            >
              <span class="absolute top-1.5 right-1.5 z-30 badge badge-primary badge-sm font-bold">
                ×{item.quantity}
              </span>
              <div
                :if={!@selected_item and !@change_printing_item}
                class="dropdown dropdown-end absolute top-8 right-1.5 z-50"
              >
                <button type="button" class="btn btn-circle btn-xs bg-base-100/85 backdrop-blur-sm shadow" tabindex="0">
                  ⋮
                </button>
                <ul
                  tabindex="0"
                  class="menu dropdown-content z-50 mt-1 w-44 rounded-box border border-base-300 bg-base-100 p-2 text-sm shadow-xl"
                >
                  <li>
                    <.link navigate={~p"/collection/#{item.id}/edit"}>Edit</.link>
                  </li>
                  <li>
                    <button type="button" phx-click="change_printing" phx-value-id={item.id}>
                      Change printing
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      class="text-error"
                      phx-click="delete"
                      phx-value-id={item.id}
                    >
                      Delete
                    </button>
                  </li>
                </ul>
              </div>
              <figure class="aspect-[5/7] overflow-hidden rounded-t-box bg-base-200 relative">
                <img
                  :if={item_image_url(item)}
                  src={item_image_url(item)}
                  alt={card_name(item)}
                  class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                  loading="lazy"
                />
                <div
                  :if={!item_image_url(item)}
                  class="flex h-full w-full items-center justify-center p-6 text-center text-sm text-base-content/50"
                >
                  No image
                </div>

                <span class="absolute bottom-1.5 left-1.5 z-20 badge badge-sm badge-outline bg-base-100/80 backdrop-blur-sm font-bold">
                  {set_code(item)}
                </span>
                <span
                  :if={price_text(item)}
                  class="absolute bottom-1.5 right-1.5 z-20 badge badge-sm bg-base-100/80 backdrop-blur-sm font-mono text-xs"
                >
                  {price_text(item)}
                </span>
                <button
                  type="button"
                  phx-click="show_details"
                  phx-value-id={item.id}
                  class="absolute inset-0 z-10 bg-black/0 transition group-hover:bg-black/20 flex items-start p-2 text-left"
                >
                  <span class="text-xs text-white opacity-0 group-hover:opacity-100 transition">
                    Click for details
                  </span>
                </button>
              </figure>
              <div class="card-body gap-2 p-3">
                <h3 class="line-clamp-1 text-sm font-bold leading-snug">{card_name(item)}</h3>
              </div>
            </div>
          </div>

          <p :if={@items == []} class="alert border border-info/20 bg-info/10 text-info-content">
            <span>
              No cards found
              <span :if={@location.collection_items != []}> matching that search</span>.
            </span>
          </p>

          <div
            :if={@location.collection_items == [] and @items == []}
            class="alert border border-info/20 bg-info/10 text-info-content"
          >
            <span>This location is empty. Find cards to add or add one directly.</span>
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
              <.link navigate={~p"/collection/#{@selected_item.id}/edit"} class="btn btn-sm btn-primary">
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
          <div class="modal-box max-w-4xl">
            <div class="space-y-2">
              <h3 class="text-xl font-bold">Change printing</h3>
              <p class="text-sm text-base-content/70">
                Choose a different printing for {card_name(@change_printing_item)}.
              </p>
            </div>

            <div class="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              <button
                :for={printing <- @change_printing_options}
                type="button"
                class={[
                  "group card overflow-hidden border bg-base-100 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-primary/40",
                  printing.scryfall_id == @change_printing_item.scryfall_id && "cursor-default border-primary opacity-75 ring-2 ring-primary/30",
                  printing.scryfall_id != @change_printing_item.scryfall_id && "cursor-pointer border-base-300 hover:-translate-y-1 hover:border-primary/60 hover:bg-primary/5 hover:shadow-xl"
                ]}
                phx-click="switch_printing"
                phx-value-id={@change_printing_item.id}
                phx-value-scryfall_id={printing.scryfall_id}
                disabled={printing.scryfall_id == @change_printing_item.scryfall_id}
              >
                <figure class="aspect-[5/7] bg-base-200 relative">
                  <img
                    :if={printing_image_url(printing)}
                    src={printing_image_url(printing)}
                    alt={printing_alt(card_name(@change_printing_item), printing)}
                    class="h-full w-full object-cover transition group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                  <div
                    :if={!printing_image_url(printing)}
                    class="flex h-full w-full items-center justify-center p-6 text-center text-sm text-base-content/50"
                  >
                    No image
                  </div>
                  <span class="absolute bottom-1.5 left-1.5 badge badge-sm badge-outline bg-base-100/80 backdrop-blur-sm font-bold">
                    {printing_set_code(printing)}
                  </span>
                  <span
                    :if={price_text(printing)}
                    class="absolute bottom-1.5 right-1.5 badge badge-sm bg-base-100/80 backdrop-blur-sm font-mono text-xs"
                  >
                    {price_text(printing)}
                  </span>
                  <span
                    :if={printing.scryfall_id == @change_printing_item.scryfall_id}
                    class="absolute top-1.5 right-1.5 badge badge-primary badge-sm"
                  >
                    Current
                  </span>
                </figure>
                <div class="card-body gap-2 p-3">
                  <div class="text-sm font-bold">{printing_label(printing)}</div>
                  <div class="text-xs text-base-content/60">
                    {printing.lang} · {finish_label(printing)}
                  </div>
                  <div
                    :if={printing.scryfall_id != @change_printing_item.scryfall_id}
                    class="btn btn-primary btn-xs mt-1 pointer-events-none"
                  >
                    Select printing
                  </div>
                  <div
                    :if={printing.scryfall_id == @change_printing_item.scryfall_id}
                    class="btn btn-ghost btn-xs mt-1 pointer-events-none"
                  >
                    Current printing
                  </div>
                </div>
              </button>
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

  defp card_name(%CollectionItem{printing: %{card: %{name: name}}}), do: name
  defp card_name(_item), do: "Unknown card"

  defp set_label(%CollectionItem{
         printing: %{set_code: set_code, collector_number: collector_number}
       }) do
    "#{String.upcase(set_code)} ##{collector_number}"
  end

  defp set_code(%CollectionItem{printing: %{set_code: set_code}}) when is_binary(set_code) do
    String.upcase(set_code)
  end

  defp set_code(_item), do: "?"

  defp printing_label(%Printing{set_code: set_code, collector_number: collector_number}) do
    "#{String.upcase(set_code)} ##{collector_number}"
  end

  defp printing_set_code(%Printing{set_code: set_code}) when is_binary(set_code) do
    String.upcase(set_code)
  end

  defp printing_set_code(_printing), do: "?"

  defp printing_alt(card_name, %Printing{} = printing) do
    "#{card_name} (#{printing_set_code(printing)})"
  end

  defp finish_label(%Printing{finishes: finishes}) do
    finishes
    |> decode_json([])
    |> Enum.join(", ")
    |> case do
      "" -> "Unknown"
      label -> label
    end
  end

  defp price_text(%CollectionItem{printing: %Printing{prices: prices}}) do
    price_text_from_prices(prices)
  end

  defp price_text(%Printing{prices: prices}) do
    price_text_from_prices(prices)
  end

  defp price_text(_item), do: nil

  defp price_text_from_prices(prices) do
    prices
    |> decode_json(%{})
    |> then(fn
      %{"usd" => usd} when is_binary(usd) and usd != "" -> "$#{format_price(usd)}"
      %{"usd_foil" => foil} when is_binary(foil) and foil != "" -> "$#{format_price(foil)}"
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
