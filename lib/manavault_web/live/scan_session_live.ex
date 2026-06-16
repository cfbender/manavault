defmodule ManavaultWeb.ScanSessionLive do
  use ManavaultWeb, :live_view

  alias Manavault.Catalog
  alias Manavault.Catalog.ScanSession

  @conditions [
    {"Near mint", "near_mint"},
    {"Lightly played", "lightly_played"},
    {"Moderately played", "moderately_played"},
    {"Heavily played", "heavily_played"},
    {"Damaged", "damaged"}
  ]

  @finishes [
    {"Nonfoil", "nonfoil"},
    {"Foil", "foil"},
    {"Etched", "etched"}
  ]

  @impl true
  def mount(_params, _session, socket) do
    changeset = Catalog.change_scan_session(%ScanSession{})

    {:ok,
     socket
     |> assign(:page_title, "Scan sessions")
     |> assign(:scan_sessions, Catalog.list_scan_sessions())
     |> assign(:locations, Catalog.list_location_options())
     |> assign(:condition_options, @conditions)
     |> assign(:finish_options, @finishes)
     |> assign(:form, to_form(changeset))}
  end

  @impl true
  def handle_event("validate", %{"scan_session" => params}, socket) do
    form =
      %ScanSession{}
      |> Catalog.change_scan_session(prepare_scan_session_params(params))
      |> Map.put(:action, :validate)
      |> to_form()

    {:noreply, assign(socket, :form, form)}
  end

  @impl true
  def handle_event("save", %{"scan_session" => params}, socket) do
    case Catalog.create_scan_session(prepare_scan_session_params(params)) do
      {:ok, scan_session} ->
        {:noreply,
         socket
         |> put_flash(:info, "Created #{scan_session.name}.")
         |> push_navigate(to: ~p"/scan-sessions/#{scan_session.id}")}

      {:error, changeset} ->
        {:noreply, assign(socket, :form, to_form(changeset))}
    end
  end

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="space-y-8">
        <section class="card border border-base-300 bg-base-200 shadow-xl">
          <div class="card-body gap-4">
            <div class="badge badge-primary badge-outline font-semibold uppercase tracking-wide">
              Review queue
            </div>
            <h1 class="text-4xl font-black tracking-tight">Scan sessions</h1>
            <p class="text-base-content/70">
              Create scan batches with inventory defaults before recognition or manual review.
            </p>
          </div>
        </section>

        <section class="card border border-base-300 bg-base-100 shadow-xl">
          <div class="card-body gap-6">
            <h2 class="card-title text-2xl">New scan session</h2>
            <.form
              for={@form}
              id="scan-session-form"
              as={:scan_session}
              phx-change="validate"
              phx-submit="save"
              class="space-y-4"
            >
              <div class="grid gap-4 md:grid-cols-2">
                <.input
                  field={@form[:default_condition]}
                  type="select"
                  label="Default condition"
                  options={@condition_options}
                />
                <.input
                  field={@form[:default_language]}
                  type="text"
                  label="Default language"
                  placeholder="en"
                />
                <.input
                  field={@form[:default_finish]}
                  type="select"
                  label="Default finish"
                  options={@finish_options}
                />
                <.input
                  field={@form[:default_location_id]}
                  type="select"
                  label="Default location"
                  options={location_options(@locations)}
                />
              </div>
              <div class="flex justify-end">
                <button class="btn btn-primary" type="submit">Create scan session</button>
              </div>
            </.form>
          </div>
        </section>

        <section class="space-y-4">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-xl font-bold tracking-tight">Existing sessions</h2>
            <span class="badge badge-ghost">{length(@scan_sessions)} total</span>
          </div>

          <div :if={@scan_sessions == []} class="alert border border-info/20 bg-info/10">
            <span>No scan sessions yet.</span>
          </div>

          <div id="scan-session-list" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <.link
              :for={session <- @scan_sessions}
              id={"scan-session-#{session.id}"}
              navigate={~p"/scan-sessions/#{session.id}"}
              class="card border border-base-300 bg-base-100 shadow-sm transition hover:border-primary/40 hover:shadow-xl"
            >
              <div class="card-body gap-3">
                <div class="flex items-start justify-between gap-3">
                  <h3 class="card-title">{session.name}</h3>
                </div>
                <p class="text-sm text-base-content/70">
                  Defaults: {humanize(session.default_condition)}, {session.default_language}, {humanize(
                    session.default_finish
                  )}
                </p>
                <p class="text-sm text-base-content/70">
                  Location: {location_name(session.default_location)}
                </p>
              </div>
            </.link>
          </div>
        </section>
      </div>
    </Layouts.app>
    """
  end

  defp prepare_scan_session_params(params) do
    params
    |> put_default_name()
    |> normalize_location_id()
  end

  defp put_default_name(params) do
    case Map.get(params, "name") do
      name when is_binary(name) ->
        if String.trim(name) == "" do
          Map.put(params, "name", Catalog.generated_scan_session_name())
        else
          params
        end

      _other ->
        Map.put(params, "name", Catalog.generated_scan_session_name())
    end
  end

  defp normalize_location_id(params) do
    case Map.get(params, "default_location_id") do
      "" -> Map.put(params, "default_location_id", nil)
      _other -> params
    end
  end

  defp location_options(locations) do
    [{"No default location", ""} | Enum.map(locations, &{&1.name, &1.id})]
  end

  defp location_name(nil), do: "No default location"
  defp location_name(location), do: location.name

  defp humanize(value) when is_binary(value) do
    value |> String.replace("_", " ") |> String.capitalize()
  end
end
