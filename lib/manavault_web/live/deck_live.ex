defmodule ManavaultWeb.DeckLive do
  use ManavaultWeb, :live_view

  alias Manavault.Catalog
  alias Manavault.Catalog.Deck

  @format_options Enum.map(Deck.formats(), &{String.capitalize(&1), &1})
  @status_options Enum.map(Deck.statuses(), &{String.capitalize(&1), &1})

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Decks")
     |> assign(:decks, [])
     |> assign(:format_options, @format_options)
     |> assign(:status_options, @status_options)
     |> assign(:deck_form, deck_form(%Deck{}))}
  end

  @impl true
  def handle_params(_params, _uri, socket) do
    {:noreply, assign(socket, :decks, Catalog.list_decks())}
  end

  @impl true
  def handle_event("validate_deck", %{"deck" => params}, socket) do
    form =
      %Deck{}
      |> Catalog.change_deck(params)
      |> Map.put(:action, :validate)
      |> to_form()

    {:noreply, assign(socket, :deck_form, form)}
  end

  @impl true
  def handle_event("save_deck", %{"deck" => params}, socket) do
    create_deck(socket, params)
  end

  @impl true
  def handle_event("delete_deck", %{"id" => id}, socket) do
    deck = Catalog.get_deck!(id)
    {:ok, _deck} = Catalog.delete_deck(deck)

    {:noreply,
     socket
     |> put_flash(:info, "Deleted #{deck.name}.")
     |> assign(:decks, Catalog.list_decks())
     |> assign(:deck_form, deck_form(%Deck{}))}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="relative left-1/2 w-[min(calc(100vw-2rem),80rem)] -translate-x-1/2 space-y-8">
        <section class="card border border-base-300 bg-base-200 shadow-xl">
          <div class="card-body gap-6 p-6 sm:p-8">
            <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div class="max-w-3xl space-y-3">
                <div class="badge badge-primary badge-outline font-semibold uppercase tracking-wide">
                  ManaVault decks
                </div>
                <h1 class="text-4xl font-black tracking-tight sm:text-5xl">Decks</h1>
                <p class="text-base leading-7 text-base-content/70">
                  Build lists by card identity, then choose exact printings when that matters.
                </p>
              </div>
              <.link navigate={~p"/cards"} class="btn btn-outline">Find cards</.link>
            </div>
          </div>
        </section>

        <section class="grid gap-6 lg:grid-cols-[minmax(20rem,24rem)_1fr] lg:items-start">
          <.form
            for={@deck_form}
            id="deck-form"
            phx-change="validate_deck"
            phx-submit="save_deck"
            class="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm"
          >
            <div class="space-y-4">
              <div>
                <h2 class="text-xl font-bold">
                  Create deck
                </h2>
              </div>

              <.input field={@deck_form[:name]} label="Name" placeholder="Esper Blink" />
              <.input
                field={@deck_form[:format]}
                type="select"
                label="Format"
                options={@format_options}
              />
              <.input
                field={@deck_form[:status]}
                type="select"
                label="Status"
                options={@status_options}
              />

              <div class="flex flex-wrap gap-2">
                <button class="btn btn-primary" type="submit">
                  Create deck
                </button>
              </div>
            </div>
          </.form>

          <div class="space-y-4">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-xl font-bold tracking-tight">Your decks</h2>
              <span class="badge badge-ghost">{length(@decks)} total</span>
            </div>

            <div :if={@decks == []} class="alert border border-info/20 bg-info/10 text-info-content">
              <span>No decks yet. Create a deck to start building.</span>
            </div>

            <div class="grid gap-3">
              <div
                :for={deck <- @decks}
                id={"deck-row-#{deck.id}"}
                class="rounded-box border border-base-300 bg-base-100 p-4 shadow-sm"
              >
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <.link navigate={~p"/decks/#{deck.id}"} class="min-w-0 space-y-1">
                    <h3 class="truncate text-lg font-bold">{deck.name}</h3>
                    <p class="text-sm text-base-content/70">
                      {String.capitalize(deck.format)} · {String.capitalize(deck.status)} · {deck_total(
                        deck
                      )} cards
                    </p>
                  </.link>
                  <div class="flex flex-wrap gap-2">
                    <.link navigate={~p"/decks/#{deck.id}"} class="btn btn-sm btn-primary">Open</.link>
                    <button
                      class="btn btn-sm btn-error btn-outline"
                      type="button"
                      phx-click="delete_deck"
                      phx-value-id={deck.id}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Layouts.app>
    """
  end

  defp create_deck(socket, params) do
    case Catalog.create_deck(params) do
      {:ok, deck} ->
        {:noreply,
         socket
         |> put_flash(:info, "Created #{deck.name}.")
         |> push_navigate(to: ~p"/decks/#{deck.id}")}

      {:error, changeset} ->
        {:noreply, assign(socket, :deck_form, to_form(changeset))}
    end
  end

  defp deck_form(deck), do: deck |> Catalog.change_deck() |> to_form()

  defp deck_total(deck) do
    deck.deck_cards
    |> List.wrap()
    |> Enum.reduce(0, &(&1.quantity + &2))
  end
end
