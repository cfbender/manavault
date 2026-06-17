defmodule ManavaultWeb.DeckShowLive do
  use ManavaultWeb, :live_view

  alias Manavault.Catalog
  alias Manavault.Catalog.{Deck, DeckCard}
  alias ManavaultWeb.CardTile
  alias Phoenix.LiveView.JS

  @format_options Enum.map(Deck.formats(), &{String.capitalize(&1), &1})
  @status_options Enum.map(Deck.statuses(), &{String.capitalize(&1), &1})

  @zone_options [
    {"Mainboard", "mainboard"},
    {"Sideboard", "sideboard"},
    {"Commander", "commander"},
    {"Maybeboard", "maybeboard"}
  ]

  @group_options [
    {"Type", "type"},
    {"Color", "color"},
    {"Color identity", "color_identity"},
    {"Mana value", "mana_value"},
    {"Rarity", "rarity"},
    {"Set", "set"},
    {"Zone", "zone"},
    {"None", "none"}
  ]

  attr :deck_card, DeckCard, required: true
  attr :index, :integer, required: true
  attr :last?, :boolean, required: true
  attr :zone_options, :list, required: true
  attr :allocation_status, :map, required: true
  attr :expanded?, :boolean, default: false
  attr :default_full?, :boolean, default: false

  def deck_stack_card(assigns) do
    ~H"""
    <div
      id={"deck-card-stack-#{@deck_card.id}"}
      class={[
        "group/card relative transition hover:z-[200] focus-within:z-[200]",
        @index > 0 && "-mt-6"
      ]}
      data-preview-card
      data-preview-image={card_image_url(@deck_card)}
      data-preview-name={card_name(@deck_card)}
      data-preview-type={@deck_card.card.type_line}
      data-preview-set={set_label(@deck_card)}
      data-preview-finish={finish_label(@deck_card.finish)}
      data-preview-quantity={@deck_card.quantity}
      data-expanded={to_string(@expanded?)}
    >
      <span class="sr-only">
        {card_name(@deck_card)} {set_label(@deck_card)} {finish_label(@deck_card.finish)}
      </span>
      <button
        type="button"
        class={[
          "block w-full overflow-hidden rounded-lg bg-base-300 text-left shadow-xl ring-1 ring-base-content/10 transition-[height,transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:ring-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/70 group-hover/card:-translate-y-1 group-hover/card:ring-primary/60",
          deck_stack_card_height(@expanded? or @default_full?)
        ]}
        phx-click="toggle_expanded_deck_card"
        phx-value-id={@deck_card.id}
        aria-expanded={@expanded?}
        data-full={to_string(@expanded? or @default_full?)}
        aria-label={"Toggle #{card_name(@deck_card)}"}
      >
        <img
          :if={card_image_url(@deck_card)}
          src={card_image_url(@deck_card)}
          alt={card_name(@deck_card)}
          class="h-full w-full object-cover object-top"
          loading="lazy"
        />
        <div
          :if={!card_image_url(@deck_card)}
          class="flex h-full items-center justify-center p-2 text-center text-xs text-base-content/60"
        >
          {card_name(@deck_card)}
        </div>
      </button>

      <div class="pointer-events-none absolute -left-1 -top-1 right-2 flex items-start justify-between gap-2">
        <div class="dropdown pointer-events-auto">
          <button
            type="button"
            class={[
              "grid size-5 place-items-center rounded-full border p-0 leading-none shadow-sm backdrop-blur transition hover:bg-base-100 hover:text-base-content focus:outline-none focus:ring-2 focus:ring-primary/40",
              allocation_status_button_class(@allocation_status.state)
            ]}
            tabindex="0"
            aria-label={allocation_status_label(@allocation_status)}
            title={allocation_status_label(@allocation_status)}
          >
            <.icon name={allocation_status_icon(@allocation_status.state)} class="block size-3" />
          </button>
          <div
            id={"deck-card-#{@deck_card.id}-allocation-menu"}
            tabindex="0"
            class="dropdown-content z-[1000] mt-1 w-72 rounded-box border border-base-300 bg-base-100 p-3 shadow-2xl"
          >
            <div class="space-y-1">
              <p class="font-semibold">{allocation_status_label(@allocation_status)}</p>
              <p class="text-xs leading-5 text-base-content/70">
                Owned {@allocation_status.owned} · Available {@allocation_status.available} · Allocated {@allocation_status.allocated} · Elsewhere {@allocation_status.allocated_elsewhere} · Missing {@allocation_status.missing}
              </p>
            </div>

            <div :if={@allocation_status.candidates == []} class="mt-3 text-sm text-base-content/60">
              No matching owned printings.
            </div>

            <ul :if={@allocation_status.candidates != []} class="menu mt-3 p-0 text-sm">
              <li :for={candidate <- @allocation_status.candidates} class="rounded-box">
                <div class="block space-y-2">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="truncate font-semibold">
                        {collection_item_label(candidate.item)}
                      </p>
                      <p class="text-xs text-base-content/60">
                        Owned {candidate.item.quantity} · Free {candidate.available} · Here {candidate.allocated} · Elsewhere {candidate.allocated_elsewhere}
                      </p>
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      class="btn btn-xs btn-primary"
                      disabled={
                        candidate.available <= 0 or
                          @allocation_status.allocated >= @allocation_status.required
                      }
                      phx-click="allocate_deck_card_item"
                      phx-value-deck_card_id={@deck_card.id}
                      phx-value-collection_item_id={candidate.item.id}
                    >
                      Allocate
                    </button>
                    <button
                      type="button"
                      class="btn btn-xs btn-outline"
                      disabled={candidate.allocated <= 0}
                      phx-click="deallocate_deck_card_item"
                      phx-value-deck_card_id={@deck_card.id}
                      phx-value-collection_item_id={candidate.item.id}
                    >
                      Deallocate
                    </button>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <div class="dropdown dropdown-end pointer-events-auto ml-auto opacity-0 transition group-hover/card:opacity-100 group-focus-within/card:opacity-100">
          <button
            type="button"
            class="btn btn-circle btn-xs border-0 bg-base-300/90 shadow"
            tabindex="0"
            aria-label="Card actions"
            data-card-actions-button
          >
            ⋮
          </button>
          <div
            id={"deck-card-#{@deck_card.id}-menu"}
            tabindex="0"
            class="dropdown-content z-[1000] mt-1 w-60 rounded-box border border-base-300 bg-base-100 p-3 shadow-2xl"
          >
            <ul class="menu p-0 text-sm">
              <li>
                <.link navigate={~p"/cards/#{@deck_card.oracle_id}"}>View details</.link>
              </li>
              <li>
                <button type="button" phx-click="delete_deck_card" phx-value-id={@deck_card.id}>
                  Remove
                </button>
              </li>
            </ul>
            <.form
              for={to_form(%{}, as: :deck_card)}
              id={"deck-card-#{@deck_card.id}-edit-form"}
              phx-submit={
                JS.push("update_deck_card")
                |> JS.dispatch("manavault:close-card-menu",
                  to: "#deck-card-stack-#{@deck_card.id}"
                )
              }
              phx-value-id={@deck_card.id}
              class="mt-3 grid gap-2"
            >
              <.input
                id={"deck-card-#{@deck_card.id}-quantity"}
                name="deck_card[quantity]"
                value={@deck_card.quantity}
                type="number"
                label="Quantity"
                min="1"
              />
              <.input
                id={"deck-card-#{@deck_card.id}-zone"}
                name="deck_card[zone]"
                value={@deck_card.zone}
                type="select"
                label="Zone"
                options={@zone_options}
              />
              <button class="btn btn-sm btn-primary" type="submit">Save</button>
            </.form>
          </div>
        </div>
      </div>

      <div
        :if={@deck_card.quantity > 1}
        class="pointer-events-none absolute -right-0.5 -top-0.5 z-20 size-6 overflow-hidden rounded-tr-md transition group-hover/card:-translate-y-1"
        aria-label={"Quantity #{@deck_card.quantity}"}
      >
        <div class="absolute right-0 top-0 size-6 bg-primary shadow-sm [clip-path:polygon(100%_0,0_0,100%_100%)]">
        </div>
        <span class="absolute right-0 top-0 flex size-4 items-center justify-center text-[0.7rem] font-black leading-none text-primary-content">
          {@deck_card.quantity}
        </span>
      </div>
    </div>
    """
  end

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:deck, nil)
     |> assign(:stats, %{})
     |> assign(:zone_options, @zone_options)
     |> assign(:format_options, @format_options)
     |> assign(:status_options, @status_options)
     |> assign(:deck_form, nil)
     |> assign(:group_options, @group_options)
     |> assign(:group_by, "type")
     |> assign(:preview_card, nil)
     |> assign(:expanded_deck_card_id, nil)
     |> assign(:bulk_allocation_preview, nil)
     |> assign(:add_form, to_form(%{"quantity" => "1", "zone" => "mainboard"}, as: :deck_card))
     |> assign(:import_form, to_form(%{"decklist" => ""}, as: :import))
     |> assign(:export_text, "")}
  end

  @impl true
  def handle_params(%{"id" => id}, _uri, socket) do
    deck = Catalog.get_deck!(id)

    {:noreply,
     socket
     |> assign_deck(deck)
     |> assign(:page_title, deck.name)}
  end

  @impl true
  def handle_event("set_group", %{"view" => %{"group" => group_by}}, socket) do
    handle_event("set_group", %{"group" => group_by}, socket)
  end

  @impl true
  def handle_event("set_group", %{"group" => group_by}, socket) do
    group_by =
      if Enum.any?(@group_options, fn {_label, value} -> value == group_by end),
        do: group_by,
        else: "type"

    {:noreply, assign(socket, :group_by, group_by)}
  end

  @impl true
  def handle_event("preview_deck_card", %{"id" => id}, socket) do
    preview_card = Enum.find(socket.assigns.deck.deck_cards, &(to_string(&1.id) == id))
    {:noreply, assign(socket, :preview_card, preview_card || socket.assigns.preview_card)}
  end

  @impl true
  def handle_event("toggle_expanded_deck_card", %{"id" => id}, socket) do
    expanded_id = if socket.assigns.expanded_deck_card_id == id, do: nil, else: id
    {:noreply, assign(socket, :expanded_deck_card_id, expanded_id)}
  end

  @impl true
  def handle_event("validate_deck", %{"deck" => params}, socket) do
    form =
      socket.assigns.deck
      |> Catalog.change_deck(params)
      |> Map.put(:action, :validate)
      |> to_form()

    {:noreply, assign(socket, :deck_form, form)}
  end

  @impl true
  def handle_event("save_deck", %{"deck" => params}, socket) do
    case Catalog.update_deck(socket.assigns.deck, params) do
      {:ok, deck} ->
        {:noreply,
         socket
         |> put_flash(:info, "Updated #{deck.name}.")
         |> assign_deck(Catalog.get_deck!(deck.id))}

      {:error, changeset} ->
        {:noreply, assign(socket, :deck_form, to_form(changeset))}
    end
  end

  @impl true
  def handle_event("add_card", %{"deck_card" => params}, socket) do
    case Catalog.add_card_to_deck(socket.assigns.deck, params) do
      {:ok, _deck_card} ->
        {:noreply,
         socket
         |> put_flash(:info, "Added card to deck.")
         |> assign_deck(Catalog.get_deck!(socket.assigns.deck.id))
         |> assign(
           :add_form,
           to_form(%{"quantity" => "1", "zone" => Map.get(params, "zone", "mainboard")},
             as: :deck_card
           )
         )}

      {:error, :card_not_found} ->
        {:noreply,
         put_flash(socket, :error, "No local Scryfall card matched that name or oracle ID.")}

      {:error, reason} when is_atom(reason) ->
        {:noreply, put_flash(socket, :error, "Could not add card: #{reason}.")}

      {:error, changeset} ->
        {:noreply, assign(socket, :add_form, to_form(changeset, as: :deck_card))}
    end
  end

  @impl true
  def handle_event("update_deck_card", %{"id" => id, "deck_card" => params}, socket) do
    deck_card = Enum.find(socket.assigns.deck.deck_cards, &(to_string(&1.id) == id))

    case Catalog.update_deck_card(deck_card, params) do
      {:ok, _deck_card} ->
        {:noreply, assign_deck(socket, Catalog.get_deck!(socket.assigns.deck.id))}

      {:error, _changeset} ->
        {:noreply, put_flash(socket, :error, "Could not update deck card.")}
    end
  end

  @impl true
  def handle_event("delete_deck_card", %{"id" => id}, socket) do
    deck_card = Enum.find(socket.assigns.deck.deck_cards, &(to_string(&1.id) == id))
    {:ok, _deck_card} = Catalog.delete_deck_card(deck_card)

    {:noreply,
     socket
     |> put_flash(:info, "Removed card from deck.")
     |> assign_deck(Catalog.get_deck!(socket.assigns.deck.id))}
  end

  @impl true
  def handle_event(
        "allocate_deck_card_item",
        %{"deck_card_id" => deck_card_id, "collection_item_id" => collection_item_id},
        socket
      ) do
    case Catalog.allocate_collection_item_to_deck_card(deck_card_id, collection_item_id) do
      {:ok, _allocation} ->
        {:noreply, assign_deck(socket, Catalog.get_deck!(socket.assigns.deck.id))}

      {:error, reason} ->
        {:noreply, put_flash(socket, :error, allocation_error(reason))}
    end
  end

  @impl true
  def handle_event(
        "deallocate_deck_card_item",
        %{"deck_card_id" => deck_card_id, "collection_item_id" => collection_item_id},
        socket
      ) do
    case Catalog.deallocate_collection_item_from_deck_card(deck_card_id, collection_item_id) do
      {:ok, _allocation} ->
        {:noreply, assign_deck(socket, Catalog.get_deck!(socket.assigns.deck.id))}

      {:error, reason} ->
        {:noreply, put_flash(socket, :error, allocation_error(reason))}
    end
  end

  @impl true
  def handle_event("preview_bulk_allocate_deck", %{"mode" => mode}, socket) do
    case Catalog.preview_bulk_allocate_deck(socket.assigns.deck, mode) do
      {:ok, preview} ->
        {:noreply, assign(socket, :bulk_allocation_preview, preview)}

      {:error, reason} ->
        {:noreply, put_flash(socket, :error, allocation_error(reason))}
    end
  end

  @impl true
  def handle_event("confirm_bulk_allocate_deck", %{"mode" => mode}, socket) do
    case Catalog.bulk_allocate_deck(socket.assigns.deck, mode) do
      {:ok, result} ->
        {:noreply,
         socket
         |> put_flash(:info, bulk_allocation_message(result, mode))
         |> assign(:bulk_allocation_preview, nil)
         |> assign_deck(Catalog.get_deck!(socket.assigns.deck.id))}

      {:error, reason} ->
        {:noreply, put_flash(socket, :error, allocation_error(reason))}
    end
  end

  @impl true
  def handle_event("close_bulk_allocation_modal", _params, socket) do
    {:noreply, assign(socket, :bulk_allocation_preview, nil)}
  end

  @impl true
  def handle_event("import_decklist", %{"import" => %{"decklist" => text}}, socket) do
    case Catalog.import_decklist(socket.assigns.deck, text) do
      {:ok, %{imported: imported, unresolved: [], skipped_printings: []}} ->
        {:noreply,
         socket
         |> put_flash(:info, "Imported #{imported} decklist lines.")
         |> assign_deck(Catalog.get_deck!(socket.assigns.deck.id))
         |> assign(:import_form, to_form(%{"decklist" => ""}, as: :import))}

      {:ok, %{imported: imported, unresolved: unresolved, skipped_printings: skipped_printings}} ->
        {:noreply,
         socket
         |> put_flash(
           :error,
           import_warning(imported, unresolved, skipped_printings)
         )
         |> assign_deck(Catalog.get_deck!(socket.assigns.deck.id))}

      {:error, _reason} ->
        {:noreply, put_flash(socket, :error, "Could not import decklist.")}
    end
  end

  @impl true
  def handle_event("refresh_export", _params, socket) do
    {:noreply, assign(socket, :export_text, Catalog.export_decklist(socket.assigns.deck))}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="relative left-1/2 w-[min(calc(100vw-2rem),96rem)] -translate-x-1/2 space-y-6">
        <.back_link navigate={~p"/decks"}>Back to decks</.back_link>

        <section class="rounded-box border border-base-300 bg-base-200/80 p-4 shadow-xl">
          <div class="space-y-3">
            <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div class="min-w-0 max-w-3xl space-y-2">
                <div class="badge badge-primary badge-outline font-semibold uppercase tracking-wide">
                  {String.capitalize(@deck.format)} · {String.capitalize(@deck.status)}
                </div>
                <h1 class="text-3xl font-black tracking-tight sm:text-4xl">{@deck.name}</h1>
                <p class="text-sm leading-6 text-base-content/70">
                  {deck_view_count(@deck)} cards across {length(deck_groups(@deck, @group_by))} groups.
                </p>
              </div>
              <div class="flex shrink-0 flex-wrap items-center gap-2">
                <details class="dropdown dropdown-end">
                  <summary class="btn btn-sm btn-primary">
                    Collection allocation <.icon name="hero-chevron-down" class="size-4" />
                  </summary>
                  <div class="dropdown-content z-30 mt-2 w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow-2xl">
                    <button
                      type="button"
                      class="btn btn-sm btn-primary w-full justify-start"
                      phx-click="preview_bulk_allocate_deck"
                      phx-value-mode="exact_printings"
                    >
                      <.icon name="hero-check-circle" class="size-4" /> Exact printings
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-outline mt-2 w-full justify-start"
                      phx-click="preview_bulk_allocate_deck"
                      phx-value-mode="matching_printings"
                    >
                      <.icon name="hero-squares-plus" class="size-4" /> Partial Matches
                    </button>
                  </div>
                </details>
                <.link navigate={~p"/decks"} class="btn btn-sm btn-outline">All decks</.link>
              </div>
            </div>

            <div class="control-toolbar grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <.form
                for={@add_form}
                id="add-card-form"
                phx-submit="add_card"
                class="control-toolbar grid gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_10rem_auto]"
              >
                <.live_component
                  module={ManavaultWeb.CardNameAutocomplete}
                  id="deck-add-card-name-autocomplete"
                  field={@add_form[:name]}
                  placeholder="Add Cards to deck"
                  class="w-full input input-sm"
                />
                <.input
                  field={@add_form[:quantity]}
                  type="number"
                  min="1"
                  class="w-full input input-sm"
                />
                <.input
                  field={@add_form[:zone]}
                  type="select"
                  options={@zone_options}
                  class="w-full select select-sm"
                />
                <div>
                  <button class="btn btn-sm btn-primary w-full" type="submit">Add</button>
                </div>
              </.form>

              <.form
                for={to_form(%{"group" => @group_by}, as: :view)}
                id="deck-group-form"
                phx-change="set_group"
                class="min-w-48 self-end"
              >
                <.input
                  field={to_form(%{"group" => @group_by}, as: :view)[:group]}
                  type="select"
                  options={@group_options}
                  class="w-full select select-sm"
                />
              </.form>
            </div>
          </div>
        </section>

        <section class="relative grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)] xl:items-start">
          <aside class="relative z-0 hidden xl:block">
            <div class="sticky top-4 space-y-4">
              <div class="overflow-hidden rounded-xl bg-base-300 shadow-2xl">
                <img
                  :if={card_image_url(@preview_card)}
                  id="deck-preview-image"
                  src={card_image_url(@preview_card)}
                  alt={card_name(@preview_card)}
                  class="aspect-[5/7] w-full object-cover"
                />
                <div
                  id="deck-preview-fallback"
                  hidden={card_image_url(@preview_card)}
                  class="flex aspect-[5/7] items-center justify-center p-6 text-center text-sm text-base-content/60"
                >
                  No image
                </div>
              </div>
              <div :if={@preview_card} class="space-y-2 px-2">
                <h2 id="deck-preview-name" class="text-xl font-black">{card_name(@preview_card)}</h2>
                <p id="deck-preview-type" class="text-sm text-base-content/70">
                  {@preview_card.card.type_line}
                </p>
                <div class="flex flex-wrap gap-2">
                  <span id="deck-preview-set" class="badge badge-outline gap-1">
                    <.set_icon
                      set_code={set_code(@preview_card)}
                      label={set_label(@preview_card)}
                      class="h-4 w-4"
                      fallback_class="text-xs"
                    />
                    <span class="sr-only">{set_label(@preview_card)}</span>
                  </span>
                  <span id="deck-preview-finish" class="badge badge-ghost">
                    {finish_label(@preview_card.finish)}
                  </span>
                  <span
                    id="deck-preview-quantity"
                    hidden={@preview_card.quantity <= 1}
                    class="badge badge-primary"
                  >
                    ×{@preview_card.quantity}
                  </span>
                </div>
              </div>
            </div>
          </aside>

          <div
            class="relative z-10 space-y-8 overflow-x-auto pb-2 xl:overflow-visible"
            id="deck-board"
            phx-hook="DeckPreview"
          >
            <div class="grid justify-center gap-x-8 gap-y-10 sm:grid-cols-[repeat(2,14rem)] lg:grid-cols-[repeat(4,14rem)] xl:justify-between">
              <div :for={column <- deck_group_columns(@deck, @group_by)} class="w-56 space-y-10">
                <section :for={group <- column} class="min-w-0 space-y-3">
                  <div class="flex items-center justify-center gap-2 sm:justify-start">
                    <span class="text-lg text-warning">{group_icon(group.label)}</span>
                    <h2 class="truncate text-base font-black">
                      <.symbolized_text :if={symbol_group_label?(group.label)} text={group.label} />
                      <span :if={!symbol_group_label?(group.label)}>{group.label}</span>
                    </h2>
                    <span class="text-sm text-base-content/60">({group.count})</span>
                  </div>

                  <div class="mx-auto w-full max-w-56 sm:mx-0">
                    <.deck_stack_card
                      :for={{deck_card, index} <- Enum.with_index(group.cards)}
                      deck_card={deck_card}
                      index={index}
                      last?={index == length(group.cards) - 1}
                      zone_options={@zone_options}
                      allocation_status={Map.fetch!(@allocation_status, deck_card.id)}
                      expanded?={to_string(deck_card.id) == @expanded_deck_card_id}
                      default_full?={
                        index == length(group.cards) - 1 and
                          !deck_group_expanded?(group, @expanded_deck_card_id)
                      }
                    />
                  </div>
                </section>
              </div>
            </div>
          </div>
        </section>

        <section class="space-y-3">
          <details
            :for={board <- deck_boards(@deck)}
            id={"deck-board-zone-#{board.zone}"}
            class="rounded-box border border-base-300 bg-base-100 shadow-sm"
            open={board.open?}
          >
            <summary class="flex cursor-pointer items-center justify-between gap-3 p-4">
              <span class="text-lg font-black">{board.label}</span>
              <span class="badge badge-outline">{board.count} cards</span>
            </summary>
            <div class="overflow-x-auto border-t border-base-300">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th class="w-16">Qty</th>
                    <th>Card</th>
                    <th class="hidden md:table-cell">Type</th>
                    <th class="hidden lg:table-cell">Printing</th>
                    <th class="hidden sm:table-cell">Finish</th>
                    <th class="w-48">Zone</th>
                  </tr>
                </thead>
                <tbody>
                  <tr :for={deck_card <- board.cards}>
                    <td class="font-black">{deck_card.quantity}</td>
                    <td>
                      <div class="flex min-w-64 items-center gap-3">
                        <img
                          :if={card_image_url(deck_card)}
                          src={card_image_url(deck_card)}
                          alt={card_name(deck_card)}
                          class="h-12 w-9 rounded object-cover object-top"
                          loading="lazy"
                        />
                        <div
                          :if={!card_image_url(deck_card)}
                          class="h-12 w-9 rounded bg-base-300"
                        />
                        <.link
                          navigate={~p"/cards/#{deck_card.oracle_id}"}
                          class="font-semibold hover:text-primary"
                        >
                          {card_name(deck_card)}
                        </.link>
                      </div>
                    </td>
                    <td class="hidden max-w-xs truncate md:table-cell">{deck_card.card.type_line}</td>
                    <td class="hidden lg:table-cell">
                      <span class="inline-flex items-center gap-1">
                        <.set_icon
                          set_code={set_code(deck_card)}
                          label={set_label(deck_card)}
                          class="h-4 w-4"
                          fallback_class="text-xs"
                        />
                        <span class="sr-only">{set_label(deck_card)}</span>
                      </span>
                    </td>
                    <td class="hidden sm:table-cell">{finish_label(deck_card.finish)}</td>
                    <td>
                      <.form
                        for={to_form(%{}, as: :deck_card)}
                        id={"deck-card-#{deck_card.id}-board-zone-form"}
                        phx-change="update_deck_card"
                        phx-value-id={deck_card.id}
                      >
                        <input type="hidden" name="deck_card[quantity]" value={deck_card.quantity} />
                        <.input
                          id={"deck-card-#{deck_card.id}-board-zone"}
                          name="deck_card[zone]"
                          value={deck_card.zone}
                          type="select"
                          options={@zone_options}
                          class="select select-sm w-full"
                        />
                      </.form>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </section>

        <section class="grid gap-4 lg:grid-cols-3">
          <details class="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
            <summary class="cursor-pointer text-xl font-bold">Deck settings</summary>
            <.form
              for={@deck_form}
              id="deck-settings-form"
              phx-change="validate_deck"
              phx-submit="save_deck"
              class="mt-4 space-y-4"
            >
              <.input field={@deck_form[:name]} label="Name" />
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
              <button class="btn btn-primary" type="submit">Save deck</button>
            </.form>
          </details>

          <details class="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
            <summary class="cursor-pointer text-xl font-bold">Import decklist</summary>
            <.form
              for={@import_form}
              id="import-decklist-form"
              phx-submit="import_decklist"
              class="mt-4 space-y-4"
            >
              <.input
                field={@import_form[:decklist]}
                type="textarea"
                label="Plain text list"
                rows="10"
                placeholder="Commander\n1 Atraxa, Praetors' Voice\n\nMainboard\n1 Sol Ring"
              />
              <button class="btn btn-primary" type="submit">Import</button>
            </.form>
          </details>

          <details class="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
            <summary class="cursor-pointer text-xl font-bold">Export</summary>
            <div class="mt-4 space-y-4">
              <button class="btn btn-sm btn-outline" type="button" phx-click="refresh_export">
                Refresh
              </button>
              <textarea class="textarea w-full font-mono text-xs" rows="10" readonly><%= @export_text %></textarea>
            </div>
          </details>
        </section>
      </div>

      <dialog
        :if={@bulk_allocation_preview}
        id="bulk-allocation-modal"
        class="modal modal-open"
        phx-click-away="close_bulk_allocation_modal"
        phx-key="Escape"
      >
        <div class="modal-box max-w-4xl">
          <div class="space-y-2">
            <h3 class="text-xl font-bold">
              {bulk_allocation_mode_label(@bulk_allocation_preview.mode)}
            </h3>
            <p class="text-sm text-base-content/70">
              {@bulk_allocation_preview.allocated} collection {copy_label(
                @bulk_allocation_preview.allocated
              )} across {@bulk_allocation_preview.cards} {deck_card_label(
                @bulk_allocation_preview.cards
              )}.
            </p>
          </div>

          <div
            :if={@bulk_allocation_preview.entries == []}
            class="alert mt-5 border border-info/20 bg-info/10"
          >
            <span>No available collection copies matched this allocation mode.</span>
          </div>

          <div
            :if={@bulk_allocation_preview.entries != []}
            class="mt-5 max-h-[60vh] overflow-y-auto"
          >
            <table class="table table-sm">
              <thead>
                <tr>
                  <th class="w-16">Qty</th>
                  <th>Deck card</th>
                  <th>Collection printing</th>
                  <th class="w-24">Match</th>
                </tr>
              </thead>
              <tbody>
                <tr :for={entry <- @bulk_allocation_preview.entries}>
                  <td class="font-black">{entry.quantity}</td>
                  <td>
                    <div class="font-semibold">{card_name(entry.deck_card)}</div>
                    <div class="text-xs text-base-content/60">
                      Wants {set_label(entry.deck_card)} · {finish_label(entry.deck_card.finish)}
                    </div>
                  </td>
                  <td>
                    <div class="font-semibold">{CardTile.set_label(entry.item)}</div>
                    <div class="text-xs text-base-content/60">
                      Owned {entry.item.quantity} · {finish_label(entry.item.finish)}
                    </div>
                  </td>
                  <td>
                    <span class={["badge badge-sm", allocation_match_badge_class(entry)]}>
                      {allocation_match_label(entry)}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="modal-action">
            <button type="button" class="btn btn-ghost" phx-click="close_bulk_allocation_modal">
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-primary"
              disabled={@bulk_allocation_preview.entries == []}
              phx-click="confirm_bulk_allocate_deck"
              phx-value-mode={allocation_mode_value(@bulk_allocation_preview.mode)}
            >
              Allocate
            </button>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button phx-click="close_bulk_allocation_modal">close</button>
        </form>
      </dialog>
    </Layouts.app>
    """
  end

  defp assign_deck(socket, deck) do
    preview_card = socket.assigns[:preview_card]
    preview_card = refresh_preview_card(deck, preview_card)
    zone_options = deck_zone_options(deck)

    socket
    |> assign(:deck, deck)
    |> assign(:stats, Catalog.deck_stats(deck))
    |> assign(:allocation_status, Catalog.deck_allocation_status(deck))
    |> assign(:zone_options, zone_options)
    |> assign(:preview_card, preview_card || List.first(deck_view_cards(deck)))
    |> assign(:deck_form, deck |> Catalog.change_deck() |> to_form())
    |> assign(:export_text, Catalog.export_decklist(deck))
  end

  defp refresh_preview_card(deck, %{id: id}) do
    Enum.find(deck.deck_cards, &(&1.id == id))
  end

  defp refresh_preview_card(_deck, _preview_card), do: nil

  defp deck_zone_options(%Deck{format: "commander"}), do: @zone_options

  defp deck_zone_options(_deck) do
    Enum.reject(@zone_options, fn {_label, zone} -> zone == "commander" end)
  end

  defp deck_view_cards(%Deck{format: "commander"} = deck) do
    Enum.filter(deck.deck_cards, &(&1.zone in ["mainboard", "commander"]))
  end

  defp deck_view_cards(deck), do: Enum.filter(deck.deck_cards, &(&1.zone == "mainboard"))

  defp deck_view_count(deck), do: Enum.reduce(deck_view_cards(deck), 0, &(&1.quantity + &2))

  defp deck_groups(deck, group_by) do
    deck
    |> deck_view_cards()
    |> Enum.group_by(&deck_group_key(&1, group_by))
    |> Enum.map(fn {label, cards} ->
      cards = Enum.sort_by(cards, &card_sort_key/1)

      %{
        label: label,
        count: Enum.reduce(cards, 0, &(&1.quantity + &2)),
        cards: cards
      }
    end)
    |> Enum.sort_by(&group_sort_key(&1, group_by))
  end

  defp deck_group_columns(deck, group_by) do
    groups = deck_groups(deck, group_by)

    if group_by == "type" do
      type_group_columns(groups)
    else
      balance_group_columns(groups, 4)
    end
  end

  defp deck_group_expanded?(_group, nil), do: false

  defp deck_group_expanded?(group, expanded_deck_card_id) do
    Enum.any?(group.cards, &(to_string(&1.id) == expanded_deck_card_id))
  end

  defp type_group_columns(groups) do
    group_by_label = Map.new(groups, &{&1.label, &1})

    [
      groups_for_labels(group_by_label, ["Commander", "Creature"]),
      groups_for_labels(group_by_label, ["Instant"]),
      groups_for_labels(group_by_label, ["Sorcery", "Artifact", "Planeswalker"]),
      groups_for_labels(group_by_label, ["Enchantment", "Land", "Other"])
    ]
    |> Enum.reject(&(&1 == []))
  end

  defp groups_for_labels(group_by_label, labels) do
    labels
    |> Enum.map(&Map.get(group_by_label, &1))
    |> Enum.reject(&is_nil/1)
  end

  defp balance_group_columns(groups, column_count) do
    columns = for _index <- 1..column_count, do: %{height: 0, groups: []}

    groups
    |> Enum.reduce(columns, fn group, columns ->
      {column, index} =
        columns
        |> Enum.with_index()
        |> Enum.min_by(fn {column, _index} -> column.height end)

      List.replace_at(columns, index, %{
        column
        | height: column.height + group_height(group),
          groups: column.groups ++ [group]
      })
    end)
    |> Enum.map(& &1.groups)
    |> Enum.reject(&(&1 == []))
  end

  defp group_height(group), do: 10 + group.count

  defp deck_boards(deck) do
    cards_by_zone = Enum.group_by(deck.deck_cards, & &1.zone)

    deck
    |> deck_zone_options()
    |> Enum.reject(fn {_label, zone} -> zone in ["mainboard", "commander"] end)
    |> Enum.map(fn {label, zone} ->
      cards =
        cards_by_zone
        |> Map.get(zone, [])
        |> Enum.sort_by(&card_sort_key/1)

      %{
        label: label,
        zone: zone,
        count: Enum.reduce(cards, 0, &(&1.quantity + &2)),
        cards: cards,
        open?: false
      }
    end)
  end

  defp deck_group_key(_deck_card, "none"), do: "Deck"
  defp deck_group_key(deck_card, "zone"), do: zone_label(deck_card.zone)
  defp deck_group_key(deck_card, "type"), do: deck_card_type(deck_card)
  defp deck_group_key(deck_card, "color"), do: card_color_label(deck_card.card.colors)

  defp deck_group_key(deck_card, "color_identity"),
    do: card_color_label(deck_card.card.color_identity)

  defp deck_group_key(%DeckCard{card: %{cmc: cmc}}, "mana_value") when is_number(cmc) do
    cmc |> round() |> Integer.to_string()
  end

  defp deck_group_key(_deck_card, "mana_value"), do: "Unknown"

  defp deck_group_key(%DeckCard{preferred_printing: %{rarity: rarity}}, "rarity")
       when is_binary(rarity) and rarity != "" do
    String.capitalize(rarity)
  end

  defp deck_group_key(_deck_card, "rarity"), do: "Unknown"

  defp deck_group_key(%DeckCard{preferred_printing: %{set_code: set_code}}, "set")
       when is_binary(set_code) do
    String.upcase(set_code)
  end

  defp deck_group_key(_deck_card, "set"), do: "Unknown"
  defp deck_group_key(deck_card, _group_by), do: deck_group_key(deck_card, "type")

  defp card_sort_key(deck_card) do
    {deck_card.card.name || "", set_label(deck_card), deck_card.id}
  end

  defp group_sort_key(%{label: label}, "type") do
    order = [
      "Commander",
      "Creature",
      "Instant",
      "Sorcery",
      "Artifact",
      "Enchantment",
      "Planeswalker",
      "Land",
      "Other"
    ]

    {Enum.find_index(order, &(&1 == label)) || 999, label}
  end

  defp group_sort_key(%{label: label}, "zone") do
    order = ["Commander", "Mainboard", "Sideboard", "Maybeboard"]
    {Enum.find_index(order, &(&1 == label)) || 999, label}
  end

  defp group_sort_key(%{label: label}, "mana_value") do
    case Integer.parse(label) do
      {value, ""} -> {value, label}
      _unknown -> {999, label}
    end
  end

  defp group_sort_key(%{label: label}, _group_by), do: label

  defp card_color_label(value) do
    colors = decode_json(value, [])

    case colors do
      [] -> "Colorless"
      colors when is_list(colors) -> Enum.map_join(colors, "", &"{#{&1}}")
      _other -> "Unknown"
    end
  end

  defp symbol_group_label?("{" <> _rest), do: true
  defp symbol_group_label?(_label), do: false

  defp deck_card_type(%DeckCard{zone: "commander"}), do: "Commander"

  defp deck_card_type(%DeckCard{card: %{type_line: type_line}}) when is_binary(type_line) do
    cond do
      String.contains?(type_line, "Creature") -> "Creature"
      String.contains?(type_line, "Land") -> "Land"
      String.contains?(type_line, "Instant") -> "Instant"
      String.contains?(type_line, "Sorcery") -> "Sorcery"
      String.contains?(type_line, "Artifact") -> "Artifact"
      String.contains?(type_line, "Enchantment") -> "Enchantment"
      String.contains?(type_line, "Planeswalker") -> "Planeswalker"
      true -> "Other"
    end
  end

  defp deck_card_type(_deck_card), do: "Other"

  defp group_icon("Commander"), do: "♜"
  defp group_icon("Creature"), do: "〽"
  defp group_icon("Instant"), do: "ϟ"
  defp group_icon("Sorcery"), do: "♨"
  defp group_icon("Artifact"), do: "◈"
  defp group_icon("Enchantment"), do: "☀"
  defp group_icon("Land"), do: "▲"
  defp group_icon(_label), do: "◆"

  defp card_image_url(%DeckCard{} = deck_card), do: CardTile.item_image_url(deck_card)
  defp card_image_url(_deck_card), do: nil

  defp deck_stack_card_height(true), do: "h-[19.6rem]"
  defp deck_stack_card_height(false), do: "h-12"

  defp card_name(%DeckCard{} = deck_card), do: CardTile.card_name(deck_card)
  defp card_name(_deck_card), do: "No card selected"

  defp set_label(%DeckCard{} = deck_card), do: CardTile.set_label(deck_card)
  defp set_label(_deck_card), do: "Unknown printing"

  defp set_code(%DeckCard{} = deck_card), do: CardTile.set_code(deck_card)
  defp set_code(_deck_card), do: "?"

  defp collection_item_label(item) do
    [
      CardTile.set_label(item),
      finish_label(item.finish)
    ]
    |> Enum.reject(&is_nil/1)
    |> Enum.join(" · ")
  end

  defp allocation_status_icon(:allocated), do: "hero-check-circle-solid"
  defp allocation_status_icon(:available), do: "hero-plus-circle-solid"
  defp allocation_status_icon(:partial), do: "hero-exclamation-triangle-solid"
  defp allocation_status_icon(:missing), do: "hero-x-circle-solid"
  defp allocation_status_icon(:basic_land), do: "hero-minus-circle-solid"
  defp allocation_status_icon(_state), do: "hero-question-mark-circle-solid"

  defp allocation_status_button_class(:allocated),
    do: "border-success/30 bg-base-100/75 text-success/80"

  defp allocation_status_button_class(:available),
    do: "border-info/30 bg-base-100/75 text-info/80"

  defp allocation_status_button_class(:partial),
    do: "border-warning/30 bg-base-100/75 text-warning/80"

  defp allocation_status_button_class(:missing),
    do: "border-error/30 bg-base-100/75 text-error/80"

  defp allocation_status_button_class(:basic_land),
    do: "border-base-content/15 bg-base-100/65 text-base-content/55"

  defp allocation_status_button_class(_state),
    do: "border-base-content/15 bg-base-100/65 text-base-content/55"

  defp allocation_status_label(%{state: :allocated, allocated: allocated, required: required}) do
    "Allocated #{allocated}/#{required}"
  end

  defp allocation_status_label(%{state: :available, available: available, required: required}) do
    "#{available}/#{required} available to allocate"
  end

  defp allocation_status_label(%{state: :partial, allocated: allocated, required: required}) do
    "Partially covered #{allocated}/#{required}"
  end

  defp allocation_status_label(%{state: :missing, missing: missing}) do
    "Missing #{missing}"
  end

  defp allocation_status_label(%{state: :basic_land}) do
    "Basic land not tracked"
  end

  defp allocation_status_label(_status), do: "Allocation status"

  defp allocation_error(:not_enough_available),
    do: "No available physical copy for that allocation."

  defp allocation_error(:deck_card_already_allocated),
    do: "That deck card is already fully allocated."

  defp allocation_error(:allocation_not_found), do: "That allocation no longer exists."

  defp allocation_error(:allocation_card_mismatch),
    do: "That collection card does not match this deck card."

  defp allocation_error(:allocation_finish_mismatch),
    do: "That collection finish does not match this deck card."

  defp allocation_error(:invalid_allocation_mode), do: "Choose an allocation mode."

  defp allocation_error(_reason), do: "Could not update allocation."

  defp bulk_allocation_message(%{allocated: 0}, _mode),
    do: "No available collection copies matched."

  defp bulk_allocation_message(%{allocated: allocated, cards: cards}, "exact_printings") do
    "Allocated #{allocated} exact collection #{copy_label(allocated)} across #{cards} #{deck_card_label(cards)}."
  end

  defp bulk_allocation_message(%{allocated: allocated, cards: cards}, _mode) do
    "Allocated #{allocated} partial match collection #{copy_label(allocated)} across #{cards} #{deck_card_label(cards)}."
  end

  defp copy_label(1), do: "copy"
  defp copy_label(_count), do: "copies"

  defp deck_card_label(1), do: "deck card"
  defp deck_card_label(_count), do: "deck cards"

  defp bulk_allocation_mode_label(:exact_printings), do: "Exact printings"
  defp bulk_allocation_mode_label(:matching_printings), do: "Partial Matches"

  defp allocation_mode_value(:exact_printings), do: "exact_printings"
  defp allocation_mode_value(:matching_printings), do: "matching_printings"

  defp allocation_match_label(%{exact?: true}), do: "Exact"
  defp allocation_match_label(_entry), do: "Partial"

  defp allocation_match_badge_class(%{exact?: true}), do: "badge-success"
  defp allocation_match_badge_class(_entry), do: "badge-warning"

  defp decode_json(value, fallback) when is_binary(value) do
    case Jason.decode(value) do
      {:ok, decoded} -> decoded
      {:error, _reason} -> fallback
    end
  end

  defp decode_json(_value, fallback), do: fallback

  defp zone_label("mainboard"), do: "Mainboard"
  defp zone_label("sideboard"), do: "Sideboard"
  defp zone_label("commander"), do: "Commander"
  defp zone_label("maybeboard"), do: "Maybeboard"

  defp finish_label("foil"), do: "Foil"
  defp finish_label("etched"), do: "Etched"
  defp finish_label(_finish), do: "Nonfoil"

  defp import_warning(imported, unresolved, skipped_printings) do
    [
      "Imported #{imported} lines.",
      unresolved != [] && "Unresolved: #{Enum.join(unresolved, ", ")}.",
      skipped_printings != [] &&
        "Ignored preferred printings for: #{Enum.join(skipped_printings, ", ")}."
    ]
    |> Enum.reject(&(&1 in [nil, false]))
    |> Enum.join(" ")
  end
end
