defmodule ManavaultWeb.ScanSessionScannerLive do
  use ManavaultWeb, :live_view

  import ManavaultWeb.CardTile, only: [card_tile: 1]

  alias Manavault.Catalog

  @conditions [
    {"Near mint", "near_mint"},
    {"Lightly played", "lightly_played"},
    {"Moderately played", "moderately_played"},
    {"Heavily played", "heavily_played"},
    {"Damaged", "damaged"}
  ]
  @finishes [{"Nonfoil", "nonfoil"}, {"Foil", "foil"}, {"Etched", "etched"}]

  @impl true
  def mount(%{"id" => id}, _session, socket) do
    scan_session = Catalog.get_scan_session!(id)

    {:ok,
     socket
     |> assign(:page_title, "Scan #{scan_session.name}")
     |> assign(:scan_session, scan_session)
     |> assign(:conditions, @conditions)
     |> assign(:finishes, @finishes)
     |> assign(:editing_scan_item, nil)
     |> assign(:changing_printing_item, nil)
     |> assign(:scanner_options_open, false)
     |> assign(:prefer_foil, false)
     |> assign(:locked_sets, [])
     |> assign(:set_search_query, "")
     |> assign(:set_search_results, [])
     |> assign(:printing_search_query, "")
     |> assign(:printing_search_results, [])
     |> assign(:status_message, "Starting camera…")
     |> assign(:error_message, nil)
     |> assign(:last_scan_item, nil)
     |> assign(:recent_scan_items, recent_scan_items(scan_session))
     |> assign(:last_recognized_card_id, last_recognized_card_id(scan_session))
     |> assign(:recognition_opts, [])}
  end

  @impl true
  def handle_event("capture", %{"image_data" => image_data} = params, socket) do
    scan_session = socket.assigns.scan_session
    force? = Map.get(params, "force", false) in [true, "true"]

    case Catalog.create_recognized_scan_item_from_capture(
           scan_session,
           image_data,
           scanner_recognition_opts(socket.assigns)
         ) do
      {:ok, scan_item} ->
        printing_id = scan_item_printing_id(scan_item)
        card_id = scan_item_card_id(scan_item)

        if (!force? and card_id) && card_id == socket.assigns.last_recognized_card_id do
          Catalog.delete_scan_item(scan_item)

          {:noreply,
           socket
           |> assign(
             :status_message,
             "Same card still in frame. Tap the preview to scan it again."
           )
           |> assign(:error_message, nil)
           |> reload_scan_session()
           |> push_event("scan_duplicate", %{printing_id: printing_id})}
        else
          {:noreply,
           socket
           |> assign(:last_scan_item, scan_item)
           |> assign(:last_recognized_card_id, card_id)
           |> assign(:status_message, "Recognized card ##{scan_item.id}. Keep scanning.")
           |> assign(:error_message, nil)
           |> reload_scan_session()
           |> push_event("scan_accepted", %{id: scan_item.id, printing_id: printing_id})}
        end

      {:error, "No card match found." <> _rest} ->
        {:noreply,
         socket
         |> assign(:status_message, "Keep scanning.")
         |> assign(:error_message, nil)
         |> push_event("scan_rejected", %{})}

      {:error, reason} when is_binary(reason) ->
        {:noreply,
         socket
         |> assign(:status_message, "No card was added.")
         |> assign(:error_message, reason)
         |> push_event("scan_rejected", %{})}

      {:error, changeset} ->
        {:noreply,
         socket
         |> assign(:status_message, "No card was added.")
         |> assign(:error_message, "Scan item could not be created: #{inspect(changeset.errors)}")
         |> push_event("scan_rejected", %{})}
    end
  end

  @impl true
  def handle_event("camera_status", %{"message" => message}, socket) when is_binary(message) do
    {:noreply, assign(socket, :status_message, message)}
  end

  def handle_event("camera_error", %{"message" => message}, socket) when is_binary(message) do
    {:noreply, assign(socket, :error_message, message)}
  end

  def handle_event("delete_scan_session", _params, socket) do
    {:ok, _scan_session} = Catalog.delete_scan_session(socket.assigns.scan_session)

    {:noreply,
     socket
     |> put_flash(:info, "Discarded scan session.")
     |> push_navigate(to: ~p"/scan-sessions")}
  end

  def handle_event("edit_scan_item", %{"id" => id}, socket) do
    {:noreply, assign(socket, :editing_scan_item, Catalog.get_scan_item!(id))}
  end

  def handle_event("open_scanner_options", _params, socket) do
    {:noreply, assign(socket, :scanner_options_open, true)}
  end

  def handle_event("close_scanner_options", _params, socket) do
    {:noreply, assign(socket, :scanner_options_open, false)}
  end

  def handle_event("toggle_prefer_foil", params, socket) do
    {:noreply, assign(socket, :prefer_foil, truthy_param?(Map.get(params, "prefer_foil")))}
  end

  def handle_event("search_scan_sets", %{"set_search" => %{"q" => query}}, socket)
      when is_binary(query) do
    {:noreply,
     socket
     |> assign(:set_search_query, query)
     |> assign(:set_search_results, Catalog.search_sets(query))}
  end

  def handle_event("add_locked_set", %{"code" => code} = params, socket) when is_binary(code) do
    set = %{set_code: String.downcase(code), set_name: Map.get(params, "name", "")}

    locked_sets =
      [set | socket.assigns.locked_sets]
      |> Enum.uniq_by(& &1.set_code)
      |> Enum.sort_by(&{String.downcase(&1.set_name || ""), &1.set_code})

    {:noreply,
     socket
     |> assign(:locked_sets, locked_sets)
     |> assign(:set_search_query, "")
     |> assign(:set_search_results, [])}
  end

  def handle_event("remove_locked_set", %{"code" => code}, socket) when is_binary(code) do
    code = String.downcase(code)

    {:noreply,
     assign(socket, :locked_sets, Enum.reject(socket.assigns.locked_sets, &(&1.set_code == code)))}
  end

  def handle_event("update_scan_item", %{"_id" => id, "scan_item" => attrs}, socket) do
    scan_item = Catalog.get_scan_item!(id)

    case Catalog.update_scan_item_review(scan_item, attrs) do
      {:ok, _scan_item} ->
        {:noreply,
         socket
         |> put_flash(:info, "Updated scan item ##{id}.")
         |> assign(:editing_scan_item, nil)
         |> reload_scan_session()}

      {:error, changeset} ->
        {:noreply,
         put_flash(socket, :error, "Scan item update failed: #{format_changeset(changeset)}")}
    end
  end

  def handle_event("adjust_scan_item_quantity", %{"id" => id, "delta" => delta}, socket) do
    scan_item = Catalog.get_scan_item!(id)
    quantity = max((scan_item.quantity || 1) + parse_delta(delta), 1)

    case Catalog.update_scan_item_review(scan_item, %{"quantity" => Integer.to_string(quantity)}) do
      {:ok, _scan_item} -> {:noreply, reload_scan_session(socket)}
      {:error, changeset} -> {:noreply, put_flash(socket, :error, format_changeset(changeset))}
    end
  end

  def handle_event("toggle_scan_item_foil", %{"id" => id}, socket) do
    scan_item = Catalog.get_scan_item!(id)
    finish = if scan_item.finish == "foil", do: "nonfoil", else: "foil"

    case Catalog.update_scan_item_review(scan_item, %{"finish" => finish}) do
      {:ok, _scan_item} -> {:noreply, reload_scan_session(socket)}
      {:error, changeset} -> {:noreply, put_flash(socket, :error, format_changeset(changeset))}
    end
  end

  def handle_event("change_scan_printing", %{"id" => id}, socket) do
    scan_item = Catalog.get_scan_item!(id)
    query = best_name(scan_item)

    {:noreply,
     socket
     |> assign(:editing_scan_item, nil)
     |> assign(:changing_printing_item, scan_item)
     |> assign(:printing_search_query, query)
     |> assign(:printing_search_results, search_printings(query))}
  end

  def handle_event("search_scan_printings", %{"search" => %{"q" => query}}, socket)
      when is_binary(query) do
    {:noreply,
     socket
     |> assign(:printing_search_query, query)
     |> assign(:printing_search_results, search_printings(query))}
  end

  def handle_event("select_printing", %{"id" => id, "scryfall-id" => scryfall_id}, socket) do
    select_printing(socket, id, scryfall_id)
  end

  def handle_event("select_printing", %{"id" => id, "scryfall_id" => scryfall_id}, socket) do
    select_printing(socket, id, scryfall_id)
  end

  def handle_event("delete_scan_item", %{"id" => id}, socket) do
    scan_item = Catalog.get_scan_item!(id)

    case Catalog.delete_scan_item(scan_item) do
      {:ok, _scan_item} ->
        {:noreply,
         socket
         |> put_flash(:info, "Deleted scan item ##{id}.")
         |> assign(:editing_scan_item, nil)
         |> reload_scan_session()}

      {:error, changeset} ->
        {:noreply, put_flash(socket, :error, format_changeset(changeset))}
    end
  end

  def handle_event("close_scan_modal", _params, socket) do
    {:noreply,
     socket
     |> assign(:editing_scan_item, nil)
     |> assign(:changing_printing_item, nil)
     |> assign(:printing_search_query, "")
     |> assign(:printing_search_results, [])}
  end

  def handle_event(_event, _params, socket), do: {:noreply, socket}

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="mx-auto flex max-w-7xl flex-col items-center gap-5 pb-8">
        <header class="flex w-full max-w-md flex-col gap-4 sm:max-w-lg sm:flex-row sm:items-end sm:justify-between lg:max-w-2xl">
          <div class="space-y-2">
            <.back_link navigate={~p"/scan-sessions/#{@scan_session.id}"}>Session</.back_link>
            <div>
              <h1 class="text-3xl font-black tracking-tight">Scan cards</h1>
              <p class="text-sm text-base-content/70">{@scan_session.name}</p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <.link navigate={~p"/scan-sessions/#{@scan_session.id}"} class="btn btn-outline btn-sm">
              Review batch
            </.link>
            <button
              type="button"
              class="btn btn-error btn-outline btn-sm"
              phx-click="delete_scan_session"
              data-confirm="Discard this scan session and all scanned cards?"
            >
              Discard session
            </button>
          </div>
        </header>

        <div class="flex w-full flex-col items-center gap-4">
          <section
            id="scanner-camera"
            phx-hook="ScannerCamera"
            class="w-full max-w-md overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl sm:max-w-lg lg:max-w-2xl"
          >
            <div
              class="relative aspect-[3/4] max-h-[72svh] min-h-[22rem] bg-neutral text-neutral-content sm:min-h-[32rem]"
              data-scanner-preview
            >
              <video
                data-scanner-video
                class="h-full w-full object-cover"
                playsinline
                muted
                autoplay
              ></video>
              <canvas data-scanner-canvas class="hidden"></canvas>

              <div class="absolute top-3 left-3 z-20">
                <button
                  type="button"
                  class={[
                    "btn btn-circle btn-sm border-base-100/40 bg-base-100/85 text-base-content shadow backdrop-blur",
                    (@prefer_foil or @locked_sets != []) && "btn-active"
                  ]}
                  phx-click="open_scanner_options"
                  aria-label="Scanner options"
                >
                  <.icon name="hero-ellipsis-horizontal" class="size-4" />
                </button>
              </div>

              <div class="pointer-events-none absolute inset-0 grid place-items-center p-7 sm:p-10">
                <div class="h-full w-full rounded-[1.35rem] border-4 border-primary/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]">
                </div>
              </div>

              <div class="absolute top-3 right-3 z-20 flex gap-2">
                <button
                  type="button"
                  data-scanner-switch
                  class="btn btn-circle btn-sm border-base-100/40 bg-base-100/85 text-base-content shadow backdrop-blur"
                  aria-label="Switch camera"
                >
                  <.icon name="hero-camera" class="size-4" />
                </button>
                <button
                  type="button"
                  data-scanner-torch
                  class="btn btn-circle btn-sm border-base-100/40 bg-base-100/85 text-base-content shadow backdrop-blur"
                  disabled
                  aria-label="Flashlight"
                >
                  <.icon name="hero-bolt" class="size-4" />
                </button>
              </div>
            </div>

            <div class="grid gap-3 p-3">
              <label class="form-control hidden" data-scanner-zoom-control>
                <div class="label">
                  <span class="label-text">Zoom</span>
                  <span class="label-text-alt" data-scanner-zoom-value></span>
                </div>
                <input data-scanner-zoom type="range" class="range range-primary" />
              </label>

              <div class="sr-only" data-scanner-status aria-live="polite">
                <span>{@status_message}</span>
              </div>
              <div
                :if={@error_message}
                class="alert alert-error py-2 text-sm"
                data-scanner-server-error
              >
                <span>{@error_message}</span>
              </div>
            </div>
          </section>

          <section class="w-full rounded-2xl border border-base-300 bg-base-100 p-3 shadow-sm sm:p-4">
            <div class="mb-4 flex items-center justify-between gap-3">
              <h2 class="text-lg font-bold">Scanned cards</h2>
              <span class="badge badge-ghost">{length(@recent_scan_items)}</span>
            </div>
            <div
              :if={@recent_scan_items == []}
              class="alert border border-info/20 bg-info/10 py-2 text-sm"
            >
              <span>Matched cards appear here as you scan.</span>
            </div>
            <div
              :if={@recent_scan_items != []}
              id="recent-scan-items"
              class="flex snap-x gap-3 overflow-x-auto pb-2"
            >
              <div
                :for={item <- @recent_scan_items}
                class="relative w-36 shrink-0 snap-start sm:w-40"
              >
                <.card_tile
                  item={item}
                  id={"recent-scan-item-#{item.id}"}
                  menu={:none}
                  show_menu={false}
                  details_event="edit_scan_item"
                  details_visibility={:always}
                />

                <div class="absolute top-2 left-2 z-30 flex items-center gap-1 rounded-full bg-black/55 p-1 text-white shadow backdrop-blur">
                  <button
                    type="button"
                    class="btn btn-circle btn-xs border-0 bg-white/15 text-white hover:bg-white/25"
                    phx-click="adjust_scan_item_quantity"
                    phx-value-id={item.id}
                    phx-value-delta="-1"
                    aria-label="Decrease quantity"
                  >
                    <.icon name="hero-minus" class="size-3" />
                  </button>
                  <span class="min-w-5 text-center text-xs font-bold">{item.quantity}</span>
                  <button
                    type="button"
                    class="btn btn-circle btn-xs border-0 bg-white/15 text-white hover:bg-white/25"
                    phx-click="adjust_scan_item_quantity"
                    phx-value-id={item.id}
                    phx-value-delta="1"
                    aria-label="Increase quantity"
                  >
                    <.icon name="hero-plus" class="size-3" />
                  </button>
                </div>

                <div class="absolute top-2 right-2 z-30 flex gap-1">
                  <button
                    type="button"
                    class={[
                      "btn btn-circle btn-xs border-0 shadow backdrop-blur",
                      item.finish == "foil" && "bg-primary text-primary-content hover:bg-primary/90",
                      item.finish != "foil" && "bg-black/55 text-white hover:bg-black/70"
                    ]}
                    phx-click="toggle_scan_item_foil"
                    phx-value-id={item.id}
                    aria-label="Toggle foil"
                  >
                    <.icon name="hero-sparkles" class="size-3" />
                  </button>
                  <button
                    type="button"
                    class="btn btn-circle btn-xs border-0 bg-black/55 text-white shadow backdrop-blur hover:bg-black/70"
                    phx-click="edit_scan_item"
                    phx-value-id={item.id}
                    aria-label="Edit scanned card"
                  >
                    <.icon name="hero-pencil-square" class="size-3" />
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <dialog :if={@scanner_options_open} class="modal modal-open">
          <div class="modal-box flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-1rem)] max-w-xl flex-col gap-5 overflow-hidden p-4 sm:p-6">
            <div class="flex shrink-0 items-start justify-between gap-3">
              <h3 class="text-lg font-bold">Scanner options</h3>
              <button
                class="btn btn-circle btn-ghost btn-sm shrink-0"
                type="button"
                phx-click="close_scanner_options"
                aria-label="Close"
              >
                <.icon name="hero-x-mark" class="size-4" />
              </button>
            </div>

            <div class="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
              <form id="scanner-prefer-foil-form" phx-change="toggle_prefer_foil">
                <input type="hidden" name="prefer_foil" value="false" />
                <label class="flex items-center justify-between gap-4 rounded-lg border border-base-300 bg-base-100 p-3">
                  <span class="font-semibold">Prefer foil</span>
                  <input
                    type="checkbox"
                    name="prefer_foil"
                    value="true"
                    checked={@prefer_foil}
                    class="toggle toggle-primary"
                  />
                </label>
              </form>

              <div class="space-y-3">
                <div class="space-y-1">
                  <h4 class="font-semibold">Lock to sets</h4>
                  <p :if={@locked_sets == []} class="text-sm text-base-content/60">
                    No set lock
                  </p>
                </div>

                <form
                  id="scanner-set-search-form"
                  phx-submit="search_scan_sets"
                  class="grid grid-cols-[minmax(0,1fr)_auto] gap-2"
                >
                  <input
                    class="input input-bordered w-full"
                    name="set_search[q]"
                    value={@set_search_query}
                    type="search"
                    autocomplete="off"
                    placeholder="Set name or code"
                  />
                  <button class="btn btn-primary" type="submit">Search</button>
                </form>

                <div :if={@locked_sets != []} class="flex flex-wrap gap-2">
                  <span
                    :for={set <- @locked_sets}
                    class="badge badge-primary badge-outline gap-1 py-3"
                  >
                    {set_option_label(set)}
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs btn-circle"
                      phx-click="remove_locked_set"
                      phx-value-code={set.set_code}
                      aria-label={"Remove #{set_option_label(set)}"}
                    >
                      <.icon name="hero-x-mark" class="size-3" />
                    </button>
                  </span>
                </div>

                <div :if={@set_search_results != []} class="grid gap-2">
                  <button
                    :for={set <- @set_search_results}
                    type="button"
                    class="btn btn-outline justify-start"
                    phx-click="add_locked_set"
                    phx-value-code={set.set_code}
                    phx-value-name={set.set_name || ""}
                  >
                    <span class="font-bold">{String.upcase(set.set_code)}</span>
                    <span class="truncate font-normal">{set.set_name}</span>
                  </button>
                </div>
              </div>
            </div>

            <div class="modal-action mt-0 shrink-0">
              <button class="btn btn-primary" type="button" phx-click="close_scanner_options">
                Done
              </button>
            </div>
          </div>
        </dialog>

        <dialog :if={@editing_scan_item} class="modal modal-open">
          <div class="modal-box space-y-4">
            <h3 class="text-lg font-bold">Edit scanned card</h3>
            <form
              id="scanner-scan-item-edit-form"
              phx-submit="update_scan_item"
              class="grid gap-3 text-sm"
            >
              <input type="hidden" name="_id" value={@editing_scan_item.id} />
              <label class="form-control">
                <span class="label-text">Quantity</span>
                <input
                  class="input input-bordered"
                  name="scan_item[quantity]"
                  type="number"
                  min="1"
                  value={@editing_scan_item.quantity}
                />
              </label>
              <div class="grid grid-cols-2 gap-3">
                <label class="form-control">
                  <span class="label-text">Condition</span>
                  <select class="select select-bordered" name="scan_item[condition]">
                    <option
                      :for={{label, value} <- @conditions}
                      value={value}
                      selected={@editing_scan_item.condition == value}
                    >
                      {label}
                    </option>
                  </select>
                </label>
                <label class="form-control">
                  <span class="label-text">Finish</span>
                  <select class="select select-bordered" name="scan_item[finish]">
                    <option
                      :for={{label, value} <- @finishes}
                      value={value}
                      selected={@editing_scan_item.finish == value}
                    >
                      {label}
                    </option>
                  </select>
                </label>
              </div>
              <label class="form-control">
                <span class="label-text">Language</span>
                <input
                  class="input input-bordered"
                  name="scan_item[language]"
                  value={@editing_scan_item.language}
                />
              </label>
              <div class="flex flex-wrap justify-between gap-2 pt-2">
                <button
                  type="button"
                  class="btn btn-outline btn-sm"
                  phx-click="change_scan_printing"
                  phx-value-id={@editing_scan_item.id}
                >
                  Change printing
                </button>
                <button
                  type="button"
                  class="btn btn-error btn-outline btn-sm"
                  phx-click="delete_scan_item"
                  phx-value-id={@editing_scan_item.id}
                >
                  Delete
                </button>
              </div>
              <div class="modal-action">
                <button class="btn btn-ghost" type="button" phx-click="close_scan_modal">Cancel</button>
                <button class="btn btn-primary" type="submit">Save</button>
              </div>
            </form>
          </div>
        </dialog>

        <dialog :if={@changing_printing_item} class="modal modal-open">
          <div class="modal-box flex h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-4 overflow-hidden p-4 sm:p-6">
            <div class="flex shrink-0 items-start justify-between gap-3">
              <div class="space-y-2">
                <h3 class="text-lg font-bold">Change card</h3>
                <p class="text-sm text-base-content/70">
                  Search for the correct card, then choose the printing to use for this scan.
                </p>
              </div>
              <button
                class="btn btn-circle btn-ghost btn-sm shrink-0"
                type="button"
                phx-click="close_scan_modal"
                aria-label="Close"
              >
                <.icon name="hero-x-mark" class="size-4" />
              </button>
            </div>

            <form
              id="scanner-printing-search-form"
              phx-submit="search_scan_printings"
              class="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] gap-2"
            >
              <input
                class="input input-bordered w-full"
                name="search[q]"
                value={@printing_search_query}
                type="search"
                autocomplete="off"
                placeholder="Card name"
              />
              <button class="btn btn-primary" type="submit">Search</button>
            </form>

            <div class="min-h-0 flex-1 overflow-y-auto pr-1">
              <div class="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(8rem,1fr))]">
                <.card_tile
                  :for={printing <- @printing_search_results}
                  item={printing}
                  menu={:none}
                  variant={:compact}
                  details_event="select_printing"
                  click_value_id={@changing_printing_item.id}
                  click_value_scryfall_id={printing.scryfall_id}
                  click_disabled={
                    printing.scryfall_id == @changing_printing_item.accepted_printing_id
                  }
                  current={printing.scryfall_id == @changing_printing_item.accepted_printing_id}
                />
              </div>
            </div>

            <p :if={@printing_search_results == []} class="alert alert-info">
              No printings found for this search.
            </p>

            <div class="modal-action mt-0 shrink-0">
              <button class="btn btn-ghost" type="button" phx-click="close_scan_modal">Close</button>
            </div>
          </div>
        </dialog>
      </div>
    </Layouts.app>
    """
  end

  defp reload_scan_session(socket) do
    scan_session = Catalog.get_scan_session!(socket.assigns.scan_session.id)

    socket
    |> assign(:scan_session, scan_session)
    |> assign(:recent_scan_items, recent_scan_items(scan_session))
    |> assign(:last_recognized_card_id, last_recognized_card_id(scan_session))
    |> refresh_open_scan_items()
  end

  defp refresh_open_scan_items(socket) do
    socket
    |> refresh_open_scan_item(:editing_scan_item)
    |> refresh_open_scan_item(:changing_printing_item)
  end

  defp refresh_open_scan_item(socket, assign_key) do
    case socket.assigns[assign_key] do
      %{id: id} -> assign(socket, assign_key, Catalog.get_scan_item!(id))
      _item -> socket
    end
  end

  defp last_recognized_card_id(scan_session) do
    scan_session
    |> recent_scan_items()
    |> List.first()
    |> scan_item_card_id()
  end

  defp scan_item_printing_id(nil), do: nil

  defp scan_item_printing_id(%{accepted_printing_id: printing_id}) when is_binary(printing_id),
    do: printing_id

  defp scan_item_printing_id(_scan_item), do: nil

  defp scan_item_card_id(nil), do: nil

  defp scan_item_card_id(%{accepted_printing: %{oracle_id: oracle_id}}) when is_binary(oracle_id),
    do: oracle_id

  defp scan_item_card_id(%{accepted_printing: %{card: %{oracle_id: oracle_id}}})
       when is_binary(oracle_id),
       do: oracle_id

  defp scan_item_card_id(_scan_item), do: nil

  defp recent_scan_items(scan_session) do
    scan_session.scan_items
    |> Enum.sort_by(& &1.id, :desc)
    |> Enum.take(12)
  end

  defp select_printing(socket, id, scryfall_id) do
    case Catalog.set_scan_item_printing(id, scryfall_id) do
      {:ok, _scan_item} ->
        {:noreply,
         socket
         |> put_flash(:info, "Changed scan item printing.")
         |> assign(:changing_printing_item, nil)
         |> assign(:printing_search_query, "")
         |> assign(:printing_search_results, [])
         |> reload_scan_session()}

      {:error, reason} ->
        {:noreply, put_flash(socket, :error, move_error(reason))}
    end
  end

  defp best_name(%{accepted_printing: %{card: %{name: name}}}), do: name
  defp best_name(_item), do: ""

  defp scanner_recognition_opts(assigns) do
    []
    |> maybe_put_opt(:prefer_foil, assigns.prefer_foil)
    |> maybe_put_opt(:set_codes, Enum.map(assigns.locked_sets, & &1.set_code))
  end

  defp maybe_put_opt(opts, _key, false), do: opts
  defp maybe_put_opt(opts, _key, []), do: opts
  defp maybe_put_opt(opts, key, value), do: Keyword.put(opts, key, value)

  defp truthy_param?(value), do: value in [true, "true", "on", "1", 1]

  defp set_option_label(%{set_code: set_code, set_name: set_name})
       when is_binary(set_code) and is_binary(set_name) and set_name != "" do
    "#{String.upcase(set_code)} · #{set_name}"
  end

  defp set_option_label(%{set_code: set_code}) when is_binary(set_code),
    do: String.upcase(set_code)

  defp search_printings(query) when is_binary(query) do
    Catalog.search_printings([name: query], limit: 36)
  end

  defp parse_delta(delta) when is_integer(delta), do: delta

  defp parse_delta(delta) when is_binary(delta) do
    case Integer.parse(delta) do
      {integer, _rest} -> integer
      :error -> 0
    end
  end

  defp parse_delta(_delta), do: 0

  defp move_error(%Ecto.Changeset{} = changeset), do: format_changeset(changeset)
  defp move_error(reason) when is_binary(reason), do: reason
  defp move_error(reason), do: inspect(reason)

  defp format_changeset(changeset) do
    changeset.errors
    |> Enum.map(fn {field, {message, _opts}} -> "#{field} #{message}" end)
    |> Enum.join(", ")
  end
end
