defmodule ManavaultWeb.CollectionLive do
  use ManavaultWeb, :live_view

  alias Manavault.Catalog
  alias Manavault.Catalog.CollectionItem

  @impl true
  def mount(_params, _session, socket) do
    locations = Catalog.list_locations()
    unfiled = Catalog.list_collection_items(q: "")

    {:ok,
     socket
     |> assign(:page_title, "Collection")
     |> assign(:locations, locations)
     |> assign(:unfiled, Enum.reject(unfiled, & &1.location_id))}
  end

  @impl true
  def handle_event("delete_location", %{"id" => id}, socket) do
    location = Catalog.get_location!(id)
    {:ok, _} = Catalog.delete_location(location)

    locations = Catalog.list_locations()

    {:noreply,
     socket
     |> put_flash(:info, "Removed #{location.name}.")
     |> assign(:locations, locations)}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="space-y-8">
        <section class="card border border-base-300 bg-base-200 shadow-xl">
          <div class="card-body gap-6 p-6 sm:p-8">
            <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div class="max-w-3xl space-y-3">
                <div class="badge badge-primary badge-outline font-semibold uppercase tracking-wide">
                  ManaVault inventory
                </div>
                <h1 class="text-4xl font-black tracking-tight sm:text-5xl">Collection</h1>
                <p class="text-base leading-7 text-base-content/70">
                  Your boxes, binders, and lists.
                </p>
              </div>
              <div class="flex gap-2">
                <.link navigate={~p"/cards"} class="btn btn-outline">Find cards</.link>
                <.link navigate={~p"/collection/new"} class="btn btn-primary">Add location</.link>
              </div>
            </div>
          </div>
        </section>

        <section class="space-y-4">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-xl font-bold tracking-tight">Locations</h2>
            <span class="badge badge-ghost">{length(@locations)} total</span>
          </div>

          <div :if={@locations == []} class="alert border border-info/20 bg-info/10 text-info-content">
            <span>No locations yet. Add a box, binder, or list to start organizing your collection.</span>
          </div>

          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <.link
              :for={loc <- @locations}
              navigate={~p"/collection/locations/#{loc.id}"}
              class="group card overflow-hidden border border-base-300 bg-base-100 shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
            >
              <div class="card-body gap-3 p-5">
                <div class="flex items-start justify-between gap-2">
                  <span class="text-3xl">{kind_icon(loc.kind)}</span>
                  <span class="badge badge-outline badge-sm">{humanize_kind(loc.kind)}</span>
                </div>
                <div>
                  <h3 class="text-lg font-bold leading-snug">{loc.name}</h3>
                  <p :if={loc.description} class="mt-1 text-sm text-base-content/60 line-clamp-2">
                    {loc.description}
                  </p>
                </div>
                <div class="flex items-center justify-between text-sm text-base-content/60">
                  <span>{length(loc.collection_items)} cards</span>
                  <span class="text-primary opacity-0 transition group-hover:opacity-100">
                    View →
                  </span>
                </div>
              </div>
            </.link>
          </div>
        </section>

        <section :if={@unfiled != []} class="space-y-4">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-xl font-bold tracking-tight">Unfiled cards</h2>
            <span class="badge badge-ghost">{length(@unfiled)} items</span>
          </div>

          <div class="overflow-x-auto rounded-box border border-base-300 bg-base-100">
            <table class="table">
              <thead>
                <tr>
                  <th>Card</th>
                  <th>Printing</th>
                  <th>Qty</th>
                  <th>Condition</th>
                  <th>Finish</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr :for={item <- @unfiled} id={"collection-item-#{item.id}"}>
                  <td class="font-semibold">{card_name(item)}</td>
                  <td>
                    <div>{set_label(item)}</div>
                    <div class="text-xs text-base-content/60">{item.scryfall_id}</div>
                  </td>
                  <td>{item.quantity}</td>
                  <td>{humanize_value(item.condition)}</td>
                  <td>{item.finish}</td>
                  <td class="text-right">
                    <.link navigate={~p"/collection/#{item.id}/edit"} class="btn btn-xs btn-outline">
                      Edit
                    </.link>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
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
