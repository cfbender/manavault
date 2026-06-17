defmodule ManavaultWeb.DeckLive do
  use ManavaultWeb, :live_view

  alias Manavault.Catalog
  alias Manavault.Catalog.{Deck, DeckCard, Price, Printing}

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

            <div class="grid gap-4">
              <div
                :for={deck <- @decks}
                id={"deck-row-#{deck.id}"}
                data-deck-cover-image={deck_cover_image_url(deck)}
                class="relative min-h-44 overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm transition hover:border-primary/50"
              >
                <img
                  :if={deck_cover_image_url(deck)}
                  src={deck_cover_image_url(deck)}
                  alt={"#{deck.name} cover art"}
                  class="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                />
                <div class="absolute inset-0 bg-gradient-to-r from-base-100 via-base-100/80 to-base-100/25">
                </div>
                <div class="absolute inset-0 bg-gradient-to-t from-base-100/95 via-base-100/45 to-transparent">
                </div>

                <div class="relative flex min-h-44 flex-col justify-between gap-6 p-5 sm:flex-row sm:items-end">
                  <.link navigate={~p"/decks/#{deck.id}"} class="min-w-0 space-y-2">
                    <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <h3 class="text-2xl font-black leading-none tracking-tight">
                        {deck.name}
                      </h3>
                      <.symbol_list
                        :if={commander_color_identity(deck) != []}
                        symbols={commander_color_identity(deck)}
                        class="translate-y-[0.08em] text-[1.05rem]"
                      />
                    </div>
                    <p class="text-sm font-medium text-base-content/75">
                      {String.capitalize(deck.format)} · {String.capitalize(deck.status)} · {deck_total(
                        deck
                      )} cards
                    </p>
                    <span :if={deck_total_text(deck)} class="badge badge-ghost">
                      {deck_total_text(deck)}
                    </span>
                  </.link>
                  <div class="flex shrink-0 flex-wrap gap-2">
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

  defp deck_total_text(%Deck{} = deck),
    do: deck.deck_cards |> Price.deck_cards_total_cents() |> Price.format_cents()

  defp commander_color_identity(deck) do
    deck.deck_cards
    |> List.wrap()
    |> Enum.filter(&(&1.zone == "commander"))
    |> Enum.flat_map(&card_color_identity/1)
    |> Enum.uniq()
    |> Enum.sort_by(&color_sort_index/1)
    |> Enum.map(&"{#{&1}}")
  end

  defp card_color_identity(%DeckCard{card: %{color_identity: color_identity}}) do
    decode_json(color_identity, [])
  end

  defp card_color_identity(_deck_card), do: []

  defp color_sort_index(color), do: Enum.find_index(~w(W U B R G C), &(&1 == color)) || 99

  defp deck_cover_image_url(deck) do
    deck.deck_cards
    |> List.wrap()
    |> deck_cover_candidates()
    |> Enum.find_value(&deck_card_image_url/1)
  end

  defp deck_cover_candidates(deck_cards) do
    commanders = Enum.filter(deck_cards, &(&1.zone == "commander"))
    commanders ++ deck_cards
  end

  defp deck_card_image_url(%DeckCard{preferred_printing: %Printing{} = printing}) do
    printing_image_url(printing, :banner)
  end

  defp deck_card_image_url(%DeckCard{card: %{printings: [printing | _]}}) do
    printing_image_url(printing, :banner)
  end

  defp deck_card_image_url(_deck_card), do: nil

  defp printing_image_url(%Printing{image_uris: image_uris}, variant) do
    image_uris
    |> decode_json(%{})
    |> image_url_from_uris(variant)
  end

  defp image_url_from_uris(uris, variant) when is_map(uris) do
    variant
    |> preferred_image_keys()
    |> Enum.find_value(&Map.get(uris, &1))
  end

  defp image_url_from_uris([uris | _rest], variant), do: image_url_from_uris(uris, variant)
  defp image_url_from_uris(_uris, _variant), do: nil

  defp preferred_image_keys(:banner), do: ["art_crop", "normal", "large", "small", "png"]

  defp decode_json(value, fallback) when is_binary(value) do
    case Jason.decode(value) do
      {:ok, decoded} -> decoded
      {:error, _reason} -> fallback
    end
  end

  defp decode_json(_value, fallback), do: fallback
end
