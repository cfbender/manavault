defmodule ManavaultWeb.ScanSessionShowLive do
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
     |> assign(:page_title, scan_session.name)
     |> assign(:locations, Catalog.list_locations())
     |> assign(:conditions, @conditions)
     |> assign(:finishes, @finishes)
     |> assign(:bulk_location_id, "")
     |> assign(:editing_scan_item, nil)
     |> assign(:changing_printing_item, nil)
     |> assign(:printing_search_results, [])
     |> assign_scan_session(scan_session)}
  end

  @impl true
  def handle_event("bulk_move", %{"bulk" => %{"location_id" => location_id}}, socket) do
    case Catalog.move_scan_session_items(socket.assigns.scan_session, location_id) do
      {:ok, %{moved: moved, skipped: skipped}} ->
        {:noreply,
         socket
         |> put_flash(:info, bulk_move_message(moved, skipped))
         |> reload_scan_session()}

      {:error, reason} ->
        {:noreply, put_flash(socket, :error, move_error(reason))}
    end
  end

  def handle_event("edit_scan_item", %{"id" => id}, socket) do
    {:noreply, assign(socket, :editing_scan_item, Catalog.get_scan_item!(id))}
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

  def handle_event("change_scan_printing", %{"id" => id}, socket) do
    {:noreply,
     socket
     |> assign(:changing_printing_item, Catalog.get_scan_item!(id))
     |> assign(:printing_search_results, [])}
  end

  def handle_event("search_printings", %{"printing_search" => params}, socket) do
    filters = [
      name: Map.get(params, "name", ""),
      set_code: Map.get(params, "set_code", ""),
      collector_number: Map.get(params, "collector_number", "")
    ]

    {:noreply,
     assign(socket, :printing_search_results, Catalog.search_printings(filters, limit: 20))}
  end

  def handle_event("select_printing", %{"id" => id, "scryfall-id" => scryfall_id}, socket) do
    case Catalog.set_scan_item_printing(id, scryfall_id) do
      {:ok, _scan_item} ->
        {:noreply,
         socket
         |> put_flash(:info, "Changed scan item printing.")
         |> assign(:changing_printing_item, nil)
         |> assign(:printing_search_results, [])
         |> reload_scan_session()}

      {:error, reason} ->
        {:noreply, put_flash(socket, :error, move_error(reason))}
    end
  end

  def handle_event("delete_scan_item", %{"id" => id}, socket) do
    scan_item = Catalog.get_scan_item!(id)

    case Catalog.delete_scan_item(scan_item) do
      {:ok, _scan_item} ->
        {:noreply,
         socket
         |> put_flash(:info, "Deleted scan item ##{id}.")
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
     |> assign(:printing_search_results, [])}
  end

  def handle_event("noop", _params, socket), do: {:noreply, socket}

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="space-y-8">
        <.back_link navigate={~p"/scan-sessions"}>Back to scan sessions</.back_link>

        <section class="card border border-base-300 bg-base-200 shadow-xl">
          <div class="card-body gap-4">
            <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div class="space-y-2">
                <div class="badge badge-primary badge-outline font-semibold uppercase tracking-wide">
                  Scan session
                </div>
                <h1 class="text-4xl font-black tracking-tight">{@scan_session.name}</h1>
                <p class="text-base-content/70">
                  Defaults: {humanize(@scan_session.default_condition)}, {@scan_session.default_language}, {humanize(
                    @scan_session.default_finish
                  )} · Location: {location_name(@scan_session.default_location)}
                </p>
              </div>
              <div class="flex flex-col gap-2 sm:items-end">
                <span class="badge badge-outline">{@scan_session.status}</span>
                <.link
                  navigate={~p"/scan-sessions/#{@scan_session.id}/scanner"}
                  class="btn btn-primary btn-sm"
                >
                  Open scanner
                </.link>
              </div>
            </div>
          </div>
        </section>

        <section class="grid gap-4 md:grid-cols-3">
          <div class="stat rounded-box border border-base-300 bg-base-100 shadow-sm">
            <div class="stat-title">Session cards</div>
            <div id="scan-items-count" class="stat-value">{length(@scan_items)}</div>
          </div>
          <div class="stat rounded-box border border-base-300 bg-base-100 shadow-sm">
            <div class="stat-title">Recognized</div>
            <div id="recognized-count" class="stat-value">{recognized_count(@scan_items)}</div>
          </div>
          <div class="stat rounded-box border border-base-300 bg-base-100 shadow-sm">
            <div class="stat-title">Unmatched</div>
            <div id="unmatched-count" class="stat-value">{unmatched_count(@scan_items)}</div>
          </div>
        </section>

        <section class="card border border-base-300 bg-base-100 shadow-sm">
          <div class="card-body gap-4">
            <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 class="card-title">Session cards</h2>
                <p class="text-sm text-base-content/70">
                  Scanned cards remain in this session until you move the batch to a location.
                </p>
              </div>
              <form
                id="scan-session-bulk-move-form"
                phx-submit="bulk_move"
                class="flex flex-col gap-2 sm:flex-row sm:items-end"
              >
                <label class="form-control">
                  <span class="label-text">Move all to</span>
                  <select class="select select-bordered select-sm" name="bulk[location_id]">
                    <option value="">No location</option>
                    <option :for={location <- @locations} value={location.id}>{location.name}</option>
                  </select>
                </label>
                <button class="btn btn-primary btn-sm" type="submit" disabled={@scan_items == []}>
                  Move session cards
                </button>
              </form>
            </div>

            <div :if={@scan_items == []} class="alert border border-info/20 bg-info/10">
              <span>No cards have been scanned in this session yet.</span>
            </div>

            <div
              :if={@scan_items != []}
              id="scan-session-card-grid"
              class="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
            >
              <.card_tile
                :for={item <- @scan_items}
                item={item}
                menu={:scan}
                details_event="noop"
              />
            </div>
          </div>
        </section>

        <dialog :if={@editing_scan_item} class="modal modal-open">
          <div class="modal-box space-y-4">
            <h3 class="text-lg font-bold">Edit scanned card</h3>
            <form
              id="scan-item-edit-form"
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
              <div class="modal-action">
                <button class="btn btn-ghost" type="button" phx-click="close_scan_modal">Cancel</button>
                <button class="btn btn-primary" type="submit">Save</button>
              </div>
            </form>
          </div>
        </dialog>

        <dialog :if={@changing_printing_item} class="modal modal-open">
          <div class="modal-box space-y-4">
            <h3 class="text-lg font-bold">Change printing</h3>
            <form id="scan-printing-search-form" phx-submit="search_printings" class="grid gap-3">
              <input
                class="input input-bordered"
                name="printing_search[name]"
                placeholder="Card name"
                value={best_name(@changing_printing_item)}
              />
              <div class="grid grid-cols-2 gap-3">
                <input
                  class="input input-bordered"
                  name="printing_search[set_code]"
                  placeholder="Set"
                />
                <input
                  class="input input-bordered"
                  name="printing_search[collector_number]"
                  placeholder="Collector #"
                />
              </div>
              <button class="btn btn-outline" type="submit">Search printings</button>
            </form>
            <div class="space-y-2">
              <div
                :for={printing <- @printing_search_results}
                class="rounded-box border border-base-300 p-3 text-sm"
              >
                <div class="font-semibold">
                  {printing.card.name} · {String.upcase(printing.set_code)} #{printing.collector_number}
                </div>
                <div class="text-base-content/70">{printing.set_name} · {printing.lang}</div>
                <button
                  type="button"
                  class="btn btn-primary btn-xs mt-2"
                  phx-click="select_printing"
                  phx-value-id={@changing_printing_item.id}
                  phx-value-scryfall-id={printing.scryfall_id}
                >
                  Use this printing
                </button>
              </div>
            </div>
            <div class="modal-action">
              <button class="btn btn-ghost" type="button" phx-click="close_scan_modal">Close</button>
            </div>
          </div>
        </dialog>
      </div>
    </Layouts.app>
    """
  end

  defp assign_scan_session(socket, scan_session) do
    assign(socket,
      scan_session: scan_session,
      scan_items: Enum.sort_by(scan_session.scan_items || [], & &1.id, :desc)
    )
  end

  defp reload_scan_session(socket) do
    socket.assigns.scan_session.id
    |> Catalog.get_scan_session!()
    |> then(&assign_scan_session(socket, &1))
  end

  defp recognized_count(items) do
    Enum.count(items, &is_binary(&1.accepted_printing_id))
  end

  defp unmatched_count(items), do: length(items) - recognized_count(items)

  defp bulk_move_message(moved, 0), do: "Moved #{moved} session cards."

  defp bulk_move_message(moved, skipped) do
    "Moved #{moved} session cards. Skipped #{skipped} unmatched or already-moved cards."
  end

  defp best_name(%{accepted_printing: %{card: %{name: name}}}), do: name
  defp best_name(_item), do: ""

  defp location_name(nil), do: "No location"
  defp location_name(location), do: location.name

  defp humanize(value) when is_binary(value) do
    value |> String.replace("_", " ") |> String.capitalize()
  end

  defp move_error(:location_not_found), do: "Location was not found."
  defp move_error(%Ecto.Changeset{} = changeset), do: format_changeset(changeset)
  defp move_error(reason) when is_binary(reason), do: reason
  defp move_error(reason), do: inspect(reason)

  defp format_changeset(changeset) do
    changeset.errors
    |> Enum.map(fn {field, {message, _opts}} -> "#{field} #{message}" end)
    |> Enum.join(", ")
  end
end
