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

  def handle_event(_event, _params, socket), do: {:noreply, socket}

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="mx-auto flex min-h-[calc(100vh-8rem)] max-w-md flex-col gap-4 pb-6">
        <div class="flex items-center justify-between gap-3">
          <.back_link navigate={~p"/scan-sessions/#{@scan_session.id}"}>Session</.back_link>
          <span class="badge badge-primary badge-outline">Mobile scanner</span>
        </div>

        <section class="space-y-1">
          <h1 class="text-2xl font-black tracking-tight">Scan cards</h1>
          <p class="text-sm text-base-content/70">{@scan_session.name}</p>
        </section>

        <section
          id="scanner-camera"
          phx-hook="ScannerCamera"
          class="card overflow-hidden border border-base-300 bg-base-100 shadow-xl"
        >
          <div class="relative aspect-[3/4] bg-neutral text-neutral-content" data-scanner-preview>
            <video
              data-scanner-video
              class="h-full w-full object-cover"
              playsinline
              muted
              autoplay
            ></video>
            <canvas data-scanner-canvas class="hidden"></canvas>

            <div class="pointer-events-none absolute inset-0 grid place-items-center p-8">
              <div class="h-full w-full rounded-3xl border-4 border-pink-500/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]">
              </div>
            </div>
          </div>

          <div class="card-body gap-4 p-4">
            <p class="text-sm text-base-content/70">
              Place one card inside the pink frame. The camera keeps scanning; repeated matches for the same card are ignored unless you tap the preview.
            </p>

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
            <div :if={@error_message} class="alert alert-error py-2 text-sm" data-scanner-server-error>
              <span>{@error_message}</span>
            </div>
          </div>
        </section>

        <section class="card border border-base-300 bg-base-100 shadow-sm">
          <div class="card-body gap-3 p-4">
            <div class="flex items-center justify-between gap-3">
              <h2 class="card-title text-lg">Session cards</h2>
              <span class="badge badge-ghost">{length(@recent_scan_items)}</span>
            </div>
            <div
              :if={@recent_scan_items == []}
              class="alert border border-info/20 bg-info/10 py-2 text-sm"
            >
              <span>No scans yet. The camera keeps scanning — only matched cards appear here.</span>
            </div>
            <div id="recent-scan-items" class="grid grid-cols-2 gap-3">
              <.card_tile
                :for={item <- @recent_scan_items}
                item={item}
                id={"recent-scan-item-#{item.id}"}
                menu={:none}
                show_menu={false}
                details_event="noop"
              />
            </div>
          </div>
        </section>
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
