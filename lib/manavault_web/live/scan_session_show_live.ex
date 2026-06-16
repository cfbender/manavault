defmodule ManavaultWeb.ScanSessionShowLive do
  use ManavaultWeb, :live_view

  alias Manavault.Catalog

  @impl true
  def mount(%{"id" => id}, _session, socket) do
    scan_session = Catalog.get_scan_session!(id)
    groups = Catalog.scan_session_items_by_review_state(scan_session)

    {:ok,
     socket
     |> assign(:page_title, scan_session.name)
     |> assign(:scan_session, scan_session)
     |> assign(:groups, groups)}
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

        <.item_section title="Pending items" id="pending-items" items={@groups.pending} />
        <.item_section title="Reviewed items" id="reviewed-items" items={@groups.reviewed} />
        <.item_section title="Accepted items" id="accepted-items" items={@groups.accepted} />
      </div>
    </Layouts.app>
    """
  end

  attr :title, :string, required: true
  attr :id, :string, required: true
  attr :items, :list, required: true

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
          <div class="card-body gap-3">
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
            <p :if={item.image_path} class="text-sm text-base-content/70">Image: {item.image_path}</p>
            <div class="space-y-2">
              <h4 class="font-semibold">Candidates ({length(item.scan_candidates)})</h4>
              <ul class="space-y-1 text-sm text-base-content/70">
                <li :for={candidate <- item.scan_candidates}>
                  #{candidate.rank} {candidate_name(candidate)} · {candidate.source} · {confidence(
                    candidate.confidence
                  )}
                </li>
              </ul>
            </div>
          </div>
        </article>
      </div>
    </section>
    """
  end

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

  defp confidence(nil), do: "no confidence"
  defp confidence(value), do: "#{round(value * 100)}%"

  defp location_name(nil), do: "No location"
  defp location_name(location), do: location.name

  defp humanize(value) when is_binary(value) do
    value |> String.replace("_", " ") |> String.capitalize()
  end
end
