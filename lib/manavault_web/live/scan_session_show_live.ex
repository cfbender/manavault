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
     |> assign(:printing_search_query, "")
     |> assign(:printing_search_results, [])
     |> assign_scan_session(scan_session)}
  end

  @impl true
  def handle_event("bulk_move", %{"bulk" => %{"location_id" => location_id}}, socket) do
    case Catalog.move_scan_session_items(socket.assigns.scan_session, location_id) do
      {:ok, %{moved: moved, skipped: skipped}} ->
        case Catalog.delete_scan_session(socket.assigns.scan_session) do
          {:ok, _scan_session} ->
            {:noreply,
             socket
             |> put_flash(:info, bulk_move_message(moved, skipped))
             |> push_navigate(to: moved_location_path(location_id))}

          {:error, changeset} ->
            {:noreply, put_flash(socket, :error, format_changeset(changeset))}
        end

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
    scan_item = Catalog.get_scan_item!(id)
    query = best_name(scan_item)

    {:noreply,
     socket
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
         |> reload_scan_session()}

      {:error, changeset} ->
        {:noreply, put_flash(socket, :error, format_changeset(changeset))}
    end
  end

  def handle_event("delete_scan_session", _params, socket) do
    {:ok, _scan_session} = Catalog.delete_scan_session(socket.assigns.scan_session)

    {:noreply,
     socket
     |> put_flash(:info, "Discarded scan session.")
     |> push_navigate(to: ~p"/scan-sessions")}
  end

  def handle_event("close_scan_modal", _params, socket) do
    {:noreply,
     socket
     |> assign(:editing_scan_item, nil)
     |> assign(:changing_printing_item, nil)
     |> assign(:printing_search_query, "")
     |> assign(:printing_search_results, [])}
  end

  def handle_event("noop", _params, socket), do: {:noreply, socket}

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="space-y-6">
        <.back_link navigate={~p"/scan-sessions"}>Back to scan sessions</.back_link>

        <section class="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-xl sm:p-7">
          <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div class="space-y-3">
              <div class="flex flex-wrap items-center gap-2">
                <span class="badge badge-primary badge-outline font-semibold uppercase tracking-wide">
                  Scan session
                </span>
              </div>
              <div>
                <h1 class="text-3xl font-black tracking-tight sm:text-4xl">{@scan_session.name}</h1>
                <p class="mt-2 max-w-3xl text-sm text-base-content/70">
                  {humanize(@scan_session.default_condition)}, {@scan_session.default_language}, {humanize(
                    @scan_session.default_finish
                  )} · {location_name(@scan_session.default_location)}
                </p>
              </div>
            </div>

            <div class="flex w-full flex-col gap-3 lg:w-80">
              <form
                id="scan-session-bulk-move-form"
                phx-submit="bulk_move"
                class="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto] sm:items-end"
              >
                <label class="form-control min-w-0">
                  <span class="label-text">Move all to</span>
                  <select class="select select-bordered select-sm w-full" name="bulk[location_id]">
                    <option value="">No location</option>
                    <option :for={location <- @locations} value={location.id}>{location.name}</option>
                  </select>
                </label>
                <button
                  class="btn btn-primary btn-sm whitespace-nowrap"
                  type="submit"
                  disabled={@scan_items == []}
                >
                  Move cards
                </button>
              </form>

              <div class="grid grid-cols-2 gap-2 sm:flex sm:items-end">
                <.link
                  navigate={~p"/scan-sessions/#{@scan_session.id}/scanner"}
                  class="btn btn-primary btn-sm whitespace-nowrap"
                >
                  Scan
                </.link>
                <button
                  type="button"
                  class="btn btn-error btn-outline btn-sm whitespace-nowrap"
                  phx-click="delete_scan_session"
                  data-confirm="Discard this scan session and all scanned cards?"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm sm:p-5">
          <div class="space-y-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="text-xl font-bold tracking-tight">Cards</h2>
                <p class="text-sm text-base-content/60">
                  Review or correct printings before moving them.
                </p>
              </div>
              <span class="badge badge-ghost">{length(@scan_items)} total</span>
            </div>

            <div :if={@scan_items == []} class="alert border border-info/20 bg-info/10">
              <span>No cards have been scanned in this session yet.</span>
            </div>

            <div
              :if={@scan_items != []}
              id="scan-session-card-grid"
              class="grid grid-cols-[repeat(auto-fit,minmax(10.5rem,13.5rem))] justify-center gap-5"
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
              id="scan-session-printing-search-form"
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

  defp bulk_move_message(moved, 0), do: "Moved #{moved} session cards."

  defp bulk_move_message(moved, skipped) do
    "Moved #{moved} session cards. Skipped #{skipped} unmatched or already-moved cards."
  end

  defp moved_location_path(nil), do: ~p"/collection?location_id=unfiled"
  defp moved_location_path(""), do: ~p"/collection?location_id=unfiled"
  defp moved_location_path(location_id), do: ~p"/collection/locations/#{location_id}"

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

  defp search_printings(query) when is_binary(query) do
    Catalog.search_printings([name: query], limit: 36)
  end

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
