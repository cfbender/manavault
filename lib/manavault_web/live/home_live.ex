defmodule ManavaultWeb.HomeLive do
  use ManavaultWeb, :live_view

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket, :page_title, "Home")}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="space-y-8">
        <section class="card border border-base-300 bg-base-200 shadow-xl">
          <div class="card-body gap-6 p-6 sm:p-8">
            <div class="max-w-3xl space-y-4">
              <div class="badge badge-primary badge-outline font-semibold uppercase tracking-wide">
                ManaVault
              </div>
              <div class="space-y-3">
                <h1 class="text-4xl font-black tracking-tight sm:text-5xl">
                  Your Magic collection, organized.
                </h1>
                <p class="text-base leading-7 text-base-content/70">
                  Jump into your collection, build decks, or search the local card catalog.
                </p>
              </div>
            </div>

            <form
              action={~p"/cards"}
              method="get"
              class="rounded-box border border-base-300 bg-base-100 p-4 shadow-sm sm:p-5"
            >
              <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <.live_component
                  module={ManavaultWeb.CardNameAutocomplete}
                  id="home-card-search-autocomplete"
                  name="q"
                  label="Search cards"
                  placeholder="Black Lotus"
                />
                <div>
                  <span class="label invisible hidden md:flex">Search</span>
                  <button class="btn btn-primary w-full md:w-auto" type="submit">Search</button>
                </div>
              </div>
            </form>
          </div>
        </section>

        <section class="grid gap-4 md:grid-cols-3">
          <.link
            navigate={~p"/collection"}
            class="group card border border-base-300 bg-base-100 shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
          >
            <div class="card-body gap-4 p-5">
              <div class="flex items-start justify-between gap-3">
                <span class="text-4xl">📦</span>
                <span class="badge badge-primary badge-outline">Inventory</span>
              </div>
              <div class="space-y-2">
                <h2 class="card-title text-2xl">Collection</h2>
                <p class="text-sm leading-6 text-base-content/70">
                  Browse boxes, binders, lists, and unfiled cards.
                </p>
              </div>
              <span class="text-sm font-semibold text-primary opacity-0 transition group-hover:opacity-100">
                Open collection →
              </span>
            </div>
          </.link>

          <.link
            navigate={~p"/decks"}
            class="group card border border-base-300 bg-base-100 shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
          >
            <div class="card-body gap-4 p-5">
              <div class="flex items-start justify-between gap-3">
                <span class="text-4xl">🗂️</span>
                <span class="badge badge-accent badge-outline">Decks</span>
              </div>
              <div class="space-y-2">
                <h2 class="card-title text-2xl">Decks</h2>
                <p class="text-sm leading-6 text-base-content/70">
                  Create decks, import lists, and organize zones.
                </p>
              </div>
              <span class="text-sm font-semibold text-primary opacity-0 transition group-hover:opacity-100">
                Build a deck →
              </span>
            </div>
          </.link>

          <.link
            navigate={~p"/scan-sessions"}
            class="group card border border-base-300 bg-base-100 shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
          >
            <div class="card-body gap-4 p-5">
              <div class="flex items-start justify-between gap-3">
                <span class="text-4xl">📷</span>
                <span class="badge badge-secondary badge-outline">Scanner</span>
              </div>
              <div class="space-y-2">
                <h2 class="card-title text-2xl">Scan sessions</h2>
                <p class="text-sm leading-6 text-base-content/70">
                  Capture cards with your camera and review matches.
                </p>
              </div>
              <span class="text-sm font-semibold text-primary opacity-0 transition group-hover:opacity-100">
                Start scanning →
              </span>
            </div>
          </.link>
        </section>
      </div>
    </Layouts.app>
    """
  end
end
