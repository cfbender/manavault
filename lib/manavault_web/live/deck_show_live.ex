defmodule ManavaultWeb.DeckShowLive do
  use ManavaultWeb, :live_view

  alias Manavault.Catalog
  alias Manavault.Catalog.{Deck, DeckCard}
  alias ManavaultWeb.CardTile

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
    >
      <span class="sr-only">
        {card_name(@deck_card)} {set_label(@deck_card)} {finish_label(@deck_card.finish)}
      </span>
      <div class={[
        "overflow-hidden rounded-lg bg-base-300 shadow-xl ring-1 ring-base-content/10 transition group-hover/card:-translate-y-1 group-hover/card:ring-primary/60",
        @last? && "aspect-[5/7]",
        !@last? && "h-12"
      ]}>
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
      </div>

      <div class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
        <span
          :if={@deck_card.quantity > 1}
          class="badge badge-primary badge-sm pointer-events-auto shadow"
        >
          {@deck_card.quantity}
        </span>
        <div class="dropdown dropdown-end pointer-events-auto ml-auto opacity-0 transition group-hover/card:opacity-100 group-focus-within/card:opacity-100">
          <button
            type="button"
            class="btn btn-circle btn-xs border-0 bg-base-300/90 shadow"
            tabindex="0"
            aria-label="Card actions"
          >
            ⋮
          </button>
          <div
            tabindex="0"
            class="dropdown-content z-[300] mt-1 w-60 rounded-box border border-base-300 bg-base-100 p-3 shadow-2xl"
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
              phx-submit="update_deck_card"
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
                  {@stats.total} cards across {length(deck_groups(@deck, @group_by))} groups.
                </p>
              </div>
              <.link navigate={~p"/decks"} class="btn btn-sm btn-outline">All decks</.link>
            </div>

            <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <.form
                for={@add_form}
                id="add-card-form"
                phx-submit="add_card"
                class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_10rem_auto] sm:items-end"
              >
                <.input
                  field={@add_form[:name]}
                  type="search"
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
                <button class="btn btn-sm btn-primary" type="submit">Add</button>
              </.form>

              <.form
                for={to_form(%{"group" => @group_by}, as: :view)}
                id="deck-group-form"
                phx-change="set_group"
                class="min-w-48"
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

        <section class="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)] xl:items-start">
          <aside class="hidden xl:block">
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
                  <span id="deck-preview-set" class="badge badge-outline">{set_label(@preview_card)}</span>
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

          <div class="space-y-8" id="deck-board" phx-hook="DeckPreview">
            <div class="grid gap-8 md:grid-cols-2 2xl:grid-cols-4">
              <div :for={column <- deck_group_columns(@deck, @group_by)} class="min-w-0 space-y-10">
                <section :for={group <- column} class="min-w-0 space-y-3">
                  <div class="flex items-center gap-2">
                    <span class="text-lg text-warning">{group_icon(group.label)}</span>
                    <h2 class="truncate text-base font-black">{group.label}</h2>
                    <span class="text-sm text-base-content/60">({group.count})</span>
                  </div>

                  <div class="w-full max-w-56">
                    <.deck_stack_card
                      :for={{deck_card, index} <- Enum.with_index(group.cards)}
                      deck_card={deck_card}
                      index={index}
                      last?={index == length(group.cards) - 1}
                      zone_options={@zone_options}
                    />
                  </div>
                </section>
              </div>
            </div>
          </div>
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
    </Layouts.app>
    """
  end

  defp assign_deck(socket, deck) do
    preview_card = socket.assigns[:preview_card]
    preview_card = refresh_preview_card(deck, preview_card)

    socket
    |> assign(:deck, deck)
    |> assign(:stats, Catalog.deck_stats(deck))
    |> assign(:preview_card, preview_card || List.first(deck.deck_cards))
    |> assign(:deck_form, deck |> Catalog.change_deck() |> to_form())
    |> assign(:export_text, Catalog.export_decklist(deck))
  end

  defp refresh_preview_card(deck, %{id: id}) do
    Enum.find(deck.deck_cards, &(&1.id == id))
  end

  defp refresh_preview_card(_deck, _preview_card), do: nil

  defp deck_groups(deck, group_by) do
    deck.deck_cards
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
      colors when is_list(colors) -> Enum.join(colors, "")
      _other -> "Unknown"
    end
  end

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

  defp card_name(%DeckCard{} = deck_card), do: CardTile.card_name(deck_card)
  defp card_name(_deck_card), do: "No card selected"

  defp set_label(%DeckCard{} = deck_card), do: CardTile.set_label(deck_card)
  defp set_label(_deck_card), do: "Unknown printing"

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
