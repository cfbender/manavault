defmodule ManavaultWeb.ScanSessionShowLive do
  use ManavaultWeb, :live_view

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
     |> assign(:printing_search_item_id, nil)
     |> assign(:printing_search_results, [])
     |> assign_scan_session(scan_session)}
  end

  @impl true
  def handle_event("update_item", %{"_id" => id, "scan_item" => attrs}, socket) do
    scan_item = Catalog.get_scan_item!(id)

    case Catalog.update_scan_item_review(scan_item, attrs) do
      {:ok, _scan_item} ->
        {:noreply,
         socket
         |> put_flash(:info, "Updated scan item ##{id}.")
         |> reload_scan_session()}

      {:error, changeset} ->
        {:noreply,
         put_flash(socket, :error, "Review update failed: #{format_changeset(changeset)}")}
    end
  end

  def handle_event("accept_best", %{"id" => id}, socket) do
    case Catalog.accept_scan_item_best_candidate(id) do
      {:ok, %{collection_item: collection_item}} ->
        {:noreply,
         socket
         |> put_flash(
           :info,
           "Accepted scan item ##{id} into collection item ##{collection_item.id}."
         )
         |> clear_search()
         |> reload_scan_session()}

      {:error, reason} ->
        {:noreply, put_flash(socket, :error, review_error(reason))}
    end
  end

  def handle_event("accept_candidate", %{"id" => id, "candidate-id" => candidate_id}, socket) do
    case Catalog.accept_scan_item_candidate(id, candidate_id) do
      {:ok, %{collection_item: collection_item}} ->
        {:noreply,
         socket
         |> put_flash(
           :info,
           "Accepted selected printing into collection item ##{collection_item.id}."
         )
         |> clear_search()
         |> reload_scan_session()}

      {:error, reason} ->
        {:noreply, put_flash(socket, :error, review_error(reason))}
    end
  end

  def handle_event("accept_printing", %{"id" => id, "scryfall-id" => scryfall_id}, socket) do
    case Catalog.accept_scan_item_printing(id, scryfall_id) do
      {:ok, %{collection_item: collection_item}} ->
        {:noreply,
         socket
         |> put_flash(
           :info,
           "Accepted exact printing into collection item ##{collection_item.id}."
         )
         |> clear_search()
         |> reload_scan_session()}

      {:error, reason} ->
        {:noreply, put_flash(socket, :error, review_error(reason))}
    end
  end

  def handle_event("select_printing", %{"id" => id, "scryfall-id" => scryfall_id}, socket) do
    case Catalog.set_scan_item_printing(id, scryfall_id) do
      {:ok, _scan_item} ->
        {:noreply,
         socket
         |> put_flash(:info, "Selected exact printing for scan item ##{id}.")
         |> clear_search()
         |> reload_scan_session()}

      {:error, reason} ->
        {:noreply, put_flash(socket, :error, review_error(reason))}
    end
  end

  def handle_event("reject_item", %{"id" => id}, socket) do
    case Catalog.reject_scan_item(id) do
      {:ok, _scan_item} ->
        {:noreply,
         socket
         |> put_flash(:info, "Rejected scan item ##{id}.")
         |> clear_search()
         |> reload_scan_session()}

      {:error, reason} ->
        {:noreply, put_flash(socket, :error, review_error(reason))}
    end
  end

  def handle_event("skip_item", %{"id" => id}, socket) do
    {:noreply, put_flash(socket, :info, "Skipped scan item ##{id} for now.")}
  end

  def handle_event("search_printings", %{"_id" => id, "printing_search" => params}, socket) do
    filters = [
      name: Map.get(params, "name", ""),
      set_code: Map.get(params, "set_code", ""),
      collector_number: Map.get(params, "collector_number", "")
    ]

    {:noreply,
     socket
     |> assign(:printing_search_item_id, parse_int(id))
     |> assign(:printing_search_results, Catalog.search_printings(filters, limit: 20))}
  end

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
            <div class="stat-title">Pending</div>
            <div id="pending-count" class="stat-value">{length(@groups.pending)}</div>
          </div>
          <div class="stat rounded-box border border-base-300 bg-base-100 shadow-sm">
            <div class="stat-title">Reviewed</div>
            <div id="reviewed-count" class="stat-value">{length(@groups.reviewed)}</div>
          </div>
          <div class="stat rounded-box border border-base-300 bg-base-100 shadow-sm">
            <div class="stat-title">Accepted</div>
            <div id="accepted-count" class="stat-value">{length(@groups.accepted)}</div>
          </div>
        </section>

        <.item_section
          title="Pending items"
          id="pending-items"
          items={@groups.pending}
          locations={@locations}
          conditions={@conditions}
          finishes={@finishes}
          printing_search_item_id={@printing_search_item_id}
          printing_search_results={@printing_search_results}
        />
        <.item_section
          title="Reviewed items"
          id="reviewed-items"
          items={@groups.reviewed}
          locations={@locations}
          conditions={@conditions}
          finishes={@finishes}
          printing_search_item_id={@printing_search_item_id}
          printing_search_results={@printing_search_results}
        />
        <.item_section
          title="Accepted items"
          id="accepted-items"
          items={@groups.accepted}
          locations={@locations}
          conditions={@conditions}
          finishes={@finishes}
          printing_search_item_id={@printing_search_item_id}
          printing_search_results={@printing_search_results}
        />
      </div>
    </Layouts.app>
    """
  end

  attr :title, :string, required: true
  attr :id, :string, required: true
  attr :items, :list, required: true
  attr :locations, :list, required: true
  attr :conditions, :list, required: true
  attr :finishes, :list, required: true
  attr :printing_search_item_id, :integer, default: nil
  attr :printing_search_results, :list, default: []

  defp item_section(assigns) do
    ~H"""
    <section class="space-y-4">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-xl font-bold tracking-tight">{@title}</h2>
        <span class="badge badge-ghost">{length(@items)} items</span>
      </div>

      <div :if={@items == []} class="alert border border-info/20 bg-info/10">
        <span>No items in this section.</span>
      </div>

      <div id={@id} class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article
          :for={item <- @items}
          id={"scan-item-#{item.id}"}
          class="card border border-base-300 bg-base-100 shadow-sm"
        >
          <div class="card-body gap-4">
            <div class="flex items-start justify-between gap-3">
              <h3 class="card-title text-lg">{item_title(item)}</h3>
              <span class="badge badge-outline">{item.status}</span>
            </div>
            <p class="text-sm text-base-content/70">
              Qty {item.quantity} · {humanize(item.condition)} · {item.language} · {humanize(
                item.finish
              )}
            </p>
            <p class="text-sm text-base-content/70">Location: {location_name(item.location)}</p>
            <p :if={item.image_path} class="break-all text-sm text-base-content/70">
              Image: {item.image_path}
            </p>

            <.review_form
              item={item}
              locations={@locations}
              conditions={@conditions}
              finishes={@finishes}
            />
            <.candidate_list item={item} />
            <.printing_search
              item={item}
              results={if @printing_search_item_id == item.id, do: @printing_search_results, else: []}
            />
          </div>
        </article>
      </div>
    </section>
    """
  end

  attr :item, :map, required: true
  attr :locations, :list, required: true
  attr :conditions, :list, required: true
  attr :finishes, :list, required: true

  defp review_form(assigns) do
    ~H"""
    <form id={"scan-item-form-#{@item.id}"} phx-submit="update_item" class="grid gap-2 text-sm">
      <input type="hidden" name="_id" value={@item.id} />
      <div class="grid grid-cols-2 gap-2">
        <label class="form-control">
          <span class="label-text">Qty</span>
          <input
            class="input input-bordered input-sm"
            name="scan_item[quantity]"
            type="number"
            min="1"
            value={@item.quantity}
          />
        </label>
        <label class="form-control">
          <span class="label-text">Language</span>
          <input
            class="input input-bordered input-sm"
            name="scan_item[language]"
            value={@item.language}
          />
        </label>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <label class="form-control">
          <span class="label-text">Condition</span>
          <select class="select select-bordered select-sm" name="scan_item[condition]">
            <option
              :for={{label, value} <- @conditions}
              value={value}
              selected={@item.condition == value}
            >
              {label}
            </option>
          </select>
        </label>
        <label class="form-control">
          <span class="label-text">Finish</span>
          <select class="select select-bordered select-sm" name="scan_item[finish]">
            <option :for={{label, value} <- @finishes} value={value} selected={@item.finish == value}>
              {label}
            </option>
          </select>
        </label>
      </div>
      <label class="form-control">
        <span class="label-text">Location</span>
        <select class="select select-bordered select-sm" name="scan_item[location_id]">
          <option value="">No location</option>
          <option
            :for={location <- @locations}
            value={location.id}
            selected={@item.location_id == location.id}
          >
            {location.name}
          </option>
        </select>
      </label>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-outline btn-xs" type="submit" disabled={@item.status == "accepted"}>Update review fields</button>
        <button
          class="btn btn-primary btn-xs"
          type="button"
          phx-click="accept_best"
          phx-value-id={@item.id}
          disabled={@item.status == "accepted"}
        >Accept best</button>
        <button
          class="btn btn-error btn-outline btn-xs"
          type="button"
          phx-click="reject_item"
          phx-value-id={@item.id}
          disabled={@item.status == "accepted"}
        >Reject</button>
        <button
          class="btn btn-ghost btn-xs"
          type="button"
          phx-click="skip_item"
          phx-value-id={@item.id}
        >Skip</button>
      </div>
    </form>
    """
  end

  attr :item, :map, required: true

  defp candidate_list(assigns) do
    ~H"""
    <div class="space-y-2">
      <h4 class="font-semibold">Candidates ({length(@item.scan_candidates)})</h4>
      <ul class="space-y-2 text-sm text-base-content/70">
        <li :for={candidate <- @item.scan_candidates} class="rounded-box border border-base-300 p-2">
          <div class="flex items-center justify-between gap-2">
            <span>
              #{candidate.rank} {candidate_name(candidate)} · {candidate.source} · {confidence(
                candidate.confidence
              )}
            </span>
            <button
              :if={candidate.printing_id && @item.status != "accepted"}
              type="button"
              class="btn btn-secondary btn-xs"
              phx-click="accept_candidate"
              phx-value-id={@item.id}
              phx-value-candidate-id={candidate.id}
            >
              Accept
            </button>
          </div>
        </li>
      </ul>
    </div>
    """
  end

  attr :item, :map, required: true
  attr :results, :list, default: []

  defp printing_search(assigns) do
    ~H"""
    <div class="space-y-2 rounded-box border border-base-300 p-3">
      <h4 class="font-semibold">Exact printing correction</h4>
      <form
        id={"printing-search-form-#{@item.id}"}
        phx-submit="search_printings"
        class="grid gap-2 text-sm"
      >
        <input type="hidden" name="_id" value={@item.id} />
        <input
          class="input input-bordered input-sm"
          name="printing_search[name]"
          placeholder="Card name"
          value={best_name(@item)}
        />
        <div class="grid grid-cols-2 gap-2">
          <input
            class="input input-bordered input-sm"
            name="printing_search[set_code]"
            placeholder="Set"
          />
          <input
            class="input input-bordered input-sm"
            name="printing_search[collector_number]"
            placeholder="Collector #"
          />
        </div>
        <button class="btn btn-outline btn-xs" type="submit">Search printings</button>
      </form>
      <div :if={@results != []} class="space-y-2">
        <div :for={printing <- @results} class="rounded-box bg-base-200 p-2 text-sm">
          <div class="font-semibold">
            {printing.card.name} · {String.upcase(printing.set_code)} #{printing.collector_number}
          </div>
          <div class="text-base-content/70">{printing.set_name} · {printing.lang}</div>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              class="btn btn-outline btn-xs"
              phx-click="select_printing"
              phx-value-id={@item.id}
              phx-value-scryfall-id={printing.scryfall_id}
            >Use this printing</button>
            <button
              type="button"
              class="btn btn-primary btn-xs"
              phx-click="accept_printing"
              phx-value-id={@item.id}
              phx-value-scryfall-id={printing.scryfall_id}
            >Accept this printing</button>
          </div>
        </div>
      </div>
    </div>
    """
  end

  defp assign_scan_session(socket, scan_session) do
    assign(socket,
      scan_session: scan_session,
      groups: Catalog.scan_session_items_by_review_state(scan_session)
    )
  end

  defp reload_scan_session(socket) do
    socket.assigns.scan_session.id
    |> Catalog.get_scan_session!()
    |> then(&assign_scan_session(socket, &1))
  end

  defp clear_search(socket),
    do: assign(socket, printing_search_item_id: nil, printing_search_results: [])

  defp item_title(%{
         accepted_printing: %{card: %{name: name}, set_code: set_code, collector_number: number}
       }) do
    "#{name} · #{String.upcase(set_code)} ##{number}"
  end

  defp item_title(%{image_path: image_path}) when is_binary(image_path), do: image_path
  defp item_title(item), do: "Scan item ##{item.id}"

  defp candidate_name(%{
         printing: %{card: %{name: name}, set_code: set_code, collector_number: number}
       }) do
    "#{name} · #{String.upcase(set_code)} ##{number}"
  end

  defp candidate_name(%{card: %{name: name}}), do: name
  defp candidate_name(_candidate), do: "Unmatched candidate"

  defp best_name(%{accepted_printing: %{card: %{name: name}}}), do: name
  defp best_name(%{scan_candidates: [%{printing: %{card: %{name: name}}} | _]}), do: name
  defp best_name(_item), do: ""

  defp confidence(nil), do: "no confidence"
  defp confidence(value), do: "#{round(value * 100)}%"

  defp location_name(nil), do: "No location"
  defp location_name(location), do: location.name

  defp humanize(value) when is_binary(value) do
    value |> String.replace("_", " ") |> String.capitalize()
  end

  defp format_changeset(changeset) do
    changeset.errors
    |> Enum.map(fn {field, {message, _opts}} -> "#{field} #{message}" end)
    |> Enum.join(", ")
  end

  defp review_error(:already_accepted), do: "Scan item has already been accepted."
  defp review_error(:missing_candidate), do: "No candidate with an exact printing is available."
  defp review_error(:missing_printing), do: "Choose an exact printing before accepting."
  defp review_error(:candidate_not_found), do: "Candidate was not found for this scan item."
  defp review_error(%Ecto.Changeset{} = changeset), do: format_changeset(changeset)
  defp review_error(reason) when is_binary(reason), do: reason
  defp review_error(reason), do: inspect(reason)

  defp parse_int(value) when is_integer(value), do: value

  defp parse_int(value) when is_binary(value) do
    case Integer.parse(value) do
      {id, ""} -> id
      _invalid -> nil
    end
  end
end
