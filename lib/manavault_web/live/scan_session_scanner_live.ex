defmodule ManavaultWeb.ScanSessionScannerLive do
  use ManavaultWeb, :live_view

  import ManavaultWeb.CardTile, only: [card_tile: 1]

  alias Manavault.Catalog

  @impl true
  def mount(%{"id" => id}, _session, socket) do
    scan_session = Catalog.get_scan_session!(id)

    {:ok,
     socket
     |> assign(:page_title, "Scan #{scan_session.name}")
     |> assign(:scan_session, scan_session)
     |> assign(:status_message, "Starting camera…")
     |> assign(:error_message, nil)
     |> assign(:last_scan_item, nil)
     |> assign(:recent_scan_items, recent_scan_items(scan_session))
     |> assign(:last_recognized_printing_id, last_recognized_printing_id(scan_session))
     |> assign(:recognition_opts, [])}
  end

  @impl true
  def handle_event("capture", %{"image_data" => image_data} = params, socket) do
    scan_session = socket.assigns.scan_session
    force? = Map.get(params, "force", false) in [true, "true"]

    case Catalog.create_recognized_scan_item_from_capture(
           scan_session,
           image_data,
           socket.assigns.recognition_opts
         ) do
      {:ok, scan_item} ->
        printing_id = scan_item_printing_id(scan_item)

        if (!force? and printing_id) && printing_id == socket.assigns.last_recognized_printing_id do
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
           |> assign(:last_recognized_printing_id, printing_id)
           |> assign(:status_message, "Recognized card ##{scan_item.id}. Keep scanning.")
           |> assign(:error_message, nil)
           |> reload_scan_session()
           |> push_event("scan_accepted", %{id: scan_item.id, printing_id: printing_id})}
        end

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

  def handle_event(_event, _params, socket), do: {:noreply, socket}

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="mx-auto max-w-7xl space-y-5 pb-8">
        <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
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

        <div class="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)] lg:items-start">
          <section
            id="scanner-camera"
            phx-hook="ScannerCamera"
            class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl"
          >
            <div
              class="relative aspect-[3/4] max-h-[calc(100vh-14rem)] min-h-[22rem] bg-neutral text-neutral-content lg:aspect-[4/5]"
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

              <div class="pointer-events-none absolute inset-0 grid place-items-center p-7 sm:p-10">
                <div class="h-full w-full rounded-[1.35rem] border-4 border-primary/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]">
                </div>
              </div>
            </div>

            <div class="grid gap-3 p-4">
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-scanner-switch
                  class="btn btn-outline"
                  aria-label="Switch camera"
                >
                  <.icon name="hero-camera" class="size-4" />
                  <span>Switch camera</span>
                </button>
                <button
                  type="button"
                  data-scanner-torch
                  class="btn btn-outline"
                  disabled
                  aria-label="Flashlight"
                >
                  <.icon name="hero-bolt" class="size-4" />
                  <span>Flashlight</span>
                </button>
              </div>

              <label class="form-control hidden" data-scanner-zoom-control>
                <div class="label">
                  <span class="label-text">Zoom</span>
                  <span class="label-text-alt" data-scanner-zoom-value></span>
                </div>
                <input data-scanner-zoom type="range" class="range range-primary" />
              </label>

              <div class="alert alert-info py-2 text-sm" data-scanner-status>
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

          <section class="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm">
            <div class="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Session cards</h2>
                <p class="text-sm text-base-content/60">Newest scans first.</p>
              </div>
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
              class="grid grid-cols-[repeat(auto-fit,minmax(10.5rem,13.5rem))] justify-center gap-4"
            >
              <.card_tile
                :for={item <- @recent_scan_items}
                item={item}
                id={"recent-scan-item-#{item.id}"}
                menu={:none}
                show_menu={false}
                details_event="noop"
              />
            </div>
          </section>
        </div>
      </div>
    </Layouts.app>
    """
  end

  defp reload_scan_session(socket) do
    scan_session = Catalog.get_scan_session!(socket.assigns.scan_session.id)

    socket
    |> assign(:scan_session, scan_session)
    |> assign(:recent_scan_items, recent_scan_items(scan_session))
  end

  defp last_recognized_printing_id(scan_session) do
    scan_session
    |> recent_scan_items()
    |> List.first()
    |> scan_item_printing_id()
  end

  defp scan_item_printing_id(nil), do: nil

  defp scan_item_printing_id(%{accepted_printing_id: printing_id}) when is_binary(printing_id),
    do: printing_id

  defp scan_item_printing_id(_scan_item), do: nil

  defp recent_scan_items(scan_session) do
    scan_session.scan_items
    |> Enum.sort_by(& &1.id, :desc)
    |> Enum.take(6)
  end
end
