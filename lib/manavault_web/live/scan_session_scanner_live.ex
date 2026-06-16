defmodule ManavaultWeb.ScanSessionScannerLive do
  use ManavaultWeb, :live_view

  alias Manavault.Catalog

  @impl true
  def mount(%{"id" => id}, _session, socket) do
    scan_session = Catalog.get_scan_session!(id)

    {:ok,
     socket
     |> assign(:page_title, "Scan #{scan_session.name}")
     |> assign(:scan_session, scan_session)
     |> assign(:status_message, "Camera is stopped.")
     |> assign(:error_message, nil)
     |> assign(:last_scan_item, nil)
     |> assign(:recognition_opts, [])
     |> assign(
       :recognition_async?,
       Application.get_env(:manavault, :scan_recognition_async, true)
     )}
  end

  @impl true
  def handle_event("capture", %{"image_data" => image_data}, socket) do
    scan_session = socket.assigns.scan_session

    case Catalog.create_scan_item_from_capture(scan_session, image_data) do
      {:ok, scan_item} ->
        enqueue_recognition(
          scan_item,
          socket.assigns.recognition_opts,
          socket.assigns.recognition_async?
        )

        {:noreply,
         socket
         |> assign(:last_scan_item, scan_item)
         |> assign(:status_message, "Captured card ##{scan_item.id}. Recognition is processing.")
         |> assign(:error_message, nil)}

      {:error, reason} when is_binary(reason) ->
        {:noreply,
         socket
         |> assign(:status_message, "Capture was not saved.")
         |> assign(:error_message, reason)}

      {:error, changeset} ->
        {:noreply,
         socket
         |> assign(:status_message, "Capture was not saved.")
         |> assign(:error_message, "Scan item could not be created: #{inspect(changeset.errors)}")}
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
  def handle_info({:recognition_finished, scan_item_id, {:ok, scan_item}}, socket) do
    {:noreply,
     socket
     |> maybe_assign_last_scan_item(scan_item_id, scan_item)
     |> assign(:status_message, "Recognition finished for card ##{scan_item_id}.")}
  end

  def handle_info({:recognition_finished, scan_item_id, {:error, reason, scan_item}}, socket) do
    {:noreply,
     socket
     |> maybe_assign_last_scan_item(scan_item_id, scan_item)
     |> assign(:status_message, "Recognition needs review for card ##{scan_item_id}.")
     |> assign(:error_message, reason)}
  end

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
          <div class="relative aspect-[3/4] bg-neutral text-neutral-content">
            <video
              data-scanner-video
              class="h-full w-full object-cover"
              playsinline
              muted
              autoplay
            ></video>
            <canvas data-scanner-canvas class="hidden"></canvas>

            <div class="pointer-events-none absolute inset-0 grid place-items-center p-6">
              <div class="h-full w-full rounded-3xl border-4 border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
                <div class="flex h-full flex-col justify-between p-4">
                  <div class="flex justify-between">
                    <span class="h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-primary"></span>
                    <span class="h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-primary"></span>
                  </div>
                  <div class="text-center text-xs font-semibold uppercase tracking-[0.25em] text-primary-content/90 drop-shadow">
                    Align card inside frame
                  </div>
                  <div class="flex justify-between">
                    <span class="h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-primary"></span>
                    <span class="h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-primary"></span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="card-body gap-4 p-4">
            <div class="grid grid-cols-2 gap-2">
              <button type="button" data-scanner-start class="btn btn-primary">Start camera</button>
              <button type="button" data-scanner-stop class="btn btn-outline">Stop</button>
              <button type="button" data-scanner-capture class="btn btn-secondary col-span-2">
                Capture card
              </button>
              <button type="button" data-scanner-switch class="btn btn-outline">Switch camera</button>
              <button type="button" data-scanner-torch class="btn btn-outline" disabled>Torch</button>
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
            <div :if={@last_scan_item} class="alert alert-success py-2 text-sm">
              <span>Saved image: {@last_scan_item.image_path}</span>
            </div>
          </div>
        </section>
      </div>
    </Layouts.app>
    """
  end

  defp enqueue_recognition(scan_item, recognition_opts, true) do
    caller = self()

    Task.Supervisor.start_child(Manavault.ScanRecognitionSupervisor, fn ->
      result = Catalog.recognize_scan_item(scan_item, recognition_opts)
      send(caller, {:recognition_finished, scan_item.id, result})
    end)
  end

  defp enqueue_recognition(_scan_item, _recognition_opts, false), do: :ok

  defp maybe_assign_last_scan_item(socket, scan_item_id, scan_item) do
    case socket.assigns.last_scan_item do
      %{id: ^scan_item_id} -> assign(socket, :last_scan_item, scan_item)
      _other -> socket
    end
  end
end
