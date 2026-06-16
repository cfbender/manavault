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
     |> assign(:last_accept, nil)
     |> assign(:recent_scan_items, recent_scan_items(scan_session))
     |> assign(
       :auto_accept_threshold,
       Application.get_env(:manavault, :scan_auto_accept_threshold)
     )
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
         |> assign(:status_message, "Captured card ##{scan_item.id}. Ready for the next card.")
         |> assign(:error_message, nil)
         |> reload_scan_session()}

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

  def handle_event("accept_best", %{"id" => id}, socket) do
    case Catalog.accept_scan_item_best_candidate(id) do
      {:ok, %{scan_item: scan_item, collection_item: collection_item}} ->
        {:noreply,
         socket
         |> assign(:last_scan_item, scan_item)
         |> assign(:last_accept, %{
           scan_item_id: scan_item.id,
           collection_item_id: collection_item.id
         })
         |> assign(:status_message, "Accepted card ##{scan_item.id}. Scan the next card.")
         |> assign(:error_message, nil)
         |> reload_scan_session()}

      {:error, reason} ->
        {:noreply,
         socket
         |> assign(:status_message, "Card was not accepted.")
         |> assign(:error_message, review_error(reason))
         |> reload_scan_session()}
    end
  end

  def handle_event("undo_last_accept", _params, socket) do
    case socket.assigns.last_accept do
      %{scan_item_id: scan_item_id} ->
        case Catalog.undo_scan_item_accept(scan_item_id) do
          {:ok, scan_item} ->
            {:noreply,
             socket
             |> assign(:last_scan_item, scan_item)
             |> assign(:last_accept, nil)
             |> assign(:status_message, "Undid accept for card ##{scan_item.id}.")
             |> assign(:error_message, nil)
             |> reload_scan_session()}

          {:error, reason} ->
            {:noreply, assign(socket, :error_message, review_error(reason))}
        end

      nil ->
        {:noreply, assign(socket, :error_message, "No accepted card is available to undo.")}
    end
  end

  def handle_event(_event, _params, socket), do: {:noreply, socket}

  @impl true
  def handle_info({:recognition_finished, scan_item_id, {:ok, scan_item}}, socket) do
    case maybe_auto_accept(scan_item, socket.assigns.auto_accept_threshold) do
      {:ok, %{scan_item: accepted_item, collection_item: collection_item}} ->
        {:noreply,
         socket
         |> maybe_assign_last_scan_item(scan_item_id, accepted_item)
         |> assign(:last_accept, %{
           scan_item_id: accepted_item.id,
           collection_item_id: collection_item.id
         })
         |> assign(:status_message, "Auto-accepted card ##{scan_item_id}.")
         |> assign(:error_message, nil)
         |> reload_scan_session()}

      :skip ->
        {:noreply,
         socket
         |> maybe_assign_last_scan_item(scan_item_id, scan_item)
         |> assign(:status_message, "Recognition finished for card ##{scan_item_id}.")
         |> assign(:error_message, nil)
         |> reload_scan_session()}

      {:error, reason} ->
        {:noreply,
         socket
         |> maybe_assign_last_scan_item(scan_item_id, scan_item)
         |> assign(:status_message, "Recognition finished; review card ##{scan_item_id}.")
         |> assign(:error_message, review_error(reason))
         |> reload_scan_session()}
    end
  end

  def handle_info({:recognition_finished, scan_item_id, {:error, reason, scan_item}}, socket) do
    {:noreply,
     socket
     |> maybe_assign_last_scan_item(scan_item_id, scan_item)
     |> assign(:status_message, "Recognition needs review for card ##{scan_item_id}.")
     |> assign(:error_message, reason)
     |> reload_scan_session()}
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

        <section class="card border border-base-300 bg-base-100 shadow-sm">
          <div class="card-body gap-3 p-4">
            <div class="flex items-center justify-between gap-3">
              <h2 class="card-title text-lg">Recent scans</h2>
              <span class="badge badge-ghost">{length(@recent_scan_items)}</span>
            </div>
            <p :if={@auto_accept_threshold} class="text-xs text-base-content/60">
              Auto-accepting candidates at {round(@auto_accept_threshold * 100)}% confidence or higher.
            </p>
            <div
              :if={@recent_scan_items == []}
              class="alert border border-info/20 bg-info/10 py-2 text-sm"
            >
              <span>No captures yet. Keep the camera open and capture cards back-to-back.</span>
            </div>
            <div id="recent-scan-items" class="space-y-2">
              <article
                :for={item <- @recent_scan_items}
                id={"recent-scan-item-#{item.id}"}
                class="rounded-box border border-base-300 p-3 text-sm"
              >
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <div class="font-semibold">{recent_item_title(item)}</div>
                    <div class="text-base-content/70">{item.status} · {best_confidence(item)}</div>
                  </div>
                  <span class="badge badge-outline">#{item.id}</span>
                </div>
                <div class="mt-2 flex flex-wrap gap-2">
                  <button
                    :if={item.status != "accepted"}
                    type="button"
                    class="btn btn-primary btn-xs"
                    phx-click="accept_best"
                    phx-value-id={item.id}
                  >Accept best</button>
                  <button
                    :if={@last_accept && @last_accept.scan_item_id == item.id}
                    type="button"
                    class="btn btn-warning btn-outline btn-xs"
                    phx-click="undo_last_accept"
                  >Undo accept</button>
                </div>
              </article>
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

  defp maybe_auto_accept(_scan_item, nil), do: :skip

  defp maybe_auto_accept(scan_item, threshold) when is_number(threshold) do
    case best_candidate(scan_item) do
      %{confidence: confidence} when is_number(confidence) and confidence >= threshold ->
        Catalog.accept_scan_item_best_candidate(scan_item.id)

      _other ->
        :skip
    end
  end

  defp reload_scan_session(socket) do
    scan_session = Catalog.get_scan_session!(socket.assigns.scan_session.id)

    socket
    |> assign(:scan_session, scan_session)
    |> assign(:recent_scan_items, recent_scan_items(scan_session))
  end

  defp recent_scan_items(scan_session) do
    scan_session.scan_items
    |> Enum.sort_by(& &1.id, :desc)
    |> Enum.take(6)
  end

  defp maybe_assign_last_scan_item(socket, scan_item_id, scan_item) do
    case socket.assigns.last_scan_item do
      %{id: ^scan_item_id} -> assign(socket, :last_scan_item, scan_item)
      _other -> socket
    end
  end

  defp recent_item_title(%{
         accepted_printing: %{card: %{name: name}, set_code: set_code, collector_number: number}
       }) do
    "#{name} · #{String.upcase(set_code)} ##{number}"
  end

  defp recent_item_title(scan_item) do
    scan_item
    |> best_candidate()
    |> case do
      %{printing: %{card: %{name: name}, set_code: set_code, collector_number: number}} ->
        "#{name} · #{String.upcase(set_code)} ##{number}"

      _other ->
        "Scan item ##{scan_item.id}"
    end
  end

  defp best_confidence(scan_item) do
    scan_item
    |> best_candidate()
    |> case do
      %{confidence: confidence} when is_number(confidence) ->
        "#{round(confidence * 100)}% confidence"

      _other ->
        "no confidence yet"
    end
  end

  defp best_candidate(%{scan_candidates: candidates}) when is_list(candidates) do
    Enum.find(candidates, & &1.printing_id)
  end

  defp best_candidate(_scan_item), do: nil

  defp review_error(:already_accepted), do: "Scan item has already been accepted."
  defp review_error(:missing_candidate), do: "No candidate with an exact printing is available."
  defp review_error(:missing_printing), do: "Choose an exact printing before accepting."
  defp review_error(:not_accepted), do: "No accepted card is available to undo."
  defp review_error(%Ecto.Changeset{} = changeset), do: format_changeset(changeset)
  defp review_error(reason) when is_binary(reason), do: reason
  defp review_error(reason), do: inspect(reason)

  defp format_changeset(changeset) do
    changeset.errors
    |> Enum.map(fn {field, {message, _opts}} -> "#{field} #{message}" end)
    |> Enum.join(", ")
  end
end
