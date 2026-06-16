defmodule ManavaultWeb.CollectionFormLive do
  use ManavaultWeb, :live_view

  alias Manavault.Catalog
  alias Manavault.Catalog.{CollectionItem, Location}

  @conditions [
    {"Near mint", "near_mint"},
    {"Lightly played", "lightly_played"},
    {"Moderately played", "moderately_played"},
    {"Heavily played", "heavily_played"},
    {"Damaged", "damaged"}
  ]

  @finish_labels %{
    "nonfoil" => "Nonfoil",
    "foil" => "Foil",
    "etched" => "Etched"
  }

  @impl true
  def mount(%{"printing_id" => scryfall_id}, _session, socket) do
    case Catalog.get_printing_by_scryfall_id(scryfall_id) do
      nil ->
        {:ok,
         socket
         |> assign(:page_title, "Printing not found")
         |> assign(:mode, :item)
         |> assign(:printing, nil)
         |> assign(:collection_item, nil)
         |> assign(:form, nil)
         |> assign(:locations, [])}

      printing ->
        printing = Manavault.Repo.preload(printing, :card)
        changeset = Catalog.new_collection_item_for_printing(scryfall_id)

        {:ok,
         socket
         |> assign(:page_title, "Add to collection")
         |> assign(:mode, :item)
         |> assign(:printing, printing)
         |> assign(:collection_item, nil)
         |> assign(:form, to_form(changeset))
         |> assign(:locations, Catalog.list_locations())}
    end
  end

  def mount(%{"id" => id}, _session, socket) do
    collection_item = Catalog.get_collection_item!(id)

    {:ok,
     socket
     |> assign(:page_title, "Edit collection item")
     |> assign(:mode, :item)
     |> assign(:printing, collection_item.printing)
     |> assign(:collection_item, collection_item)
     |> assign(:form, to_form(Catalog.change_collection_item(collection_item)))
     |> assign(:locations, Catalog.list_locations())}
  end

  def mount(%{}, _session, socket) do
    changeset = Catalog.change_location(%Location{})

    {:ok,
     socket
     |> assign(:page_title, "Add location")
     |> assign(:mode, :location)
     |> assign(:printing, nil)
     |> assign(:collection_item, nil)
     |> assign(:form, to_form(changeset))}
  end

  @impl true
  def handle_event("validate", %{"location" => params}, %{assigns: %{mode: :location}} = socket) do
    form =
      %Location{}
      |> Catalog.change_location(params)
      |> Map.put(:action, :validate)
      |> to_form()

    {:noreply, assign(socket, :form, form)}
  end

  def handle_event("validate", %{"collection_item" => params}, socket) do
    collection_item = socket.assigns.collection_item || %CollectionItem{}

    form =
      collection_item
      |> Catalog.change_collection_item(params)
      |> Map.put(:action, :validate)
      |> to_form()

    {:noreply, assign(socket, :form, form)}
  end

  def handle_event(
        "save",
        %{"location" => params},
        %{assigns: %{mode: :location}} = socket
      ) do
    case Catalog.create_location(params) do
      {:ok, location} ->
        {:noreply,
         socket
         |> put_flash(:info, "Created #{location.name}.")
         |> push_navigate(to: ~p"/collection")}

      {:error, changeset} ->
        {:noreply, assign(socket, :form, to_form(changeset))}
    end
  end

  def handle_event(
        "save",
        %{"collection_item" => params},
        %{assigns: %{collection_item: nil}} = socket
      ) do
    params = normalize_location_id(params)

    case Catalog.create_collection_item(params) do
      {:ok, _item} ->
        {:noreply,
         socket
         |> put_flash(:info, "Added #{printing_name(socket.assigns.printing)} to collection.")
         |> push_navigate(to: ~p"/collection")}

      {:error, changeset} ->
        {:noreply, assign(socket, :form, to_form(changeset))}
    end
  end

  def handle_event("save", %{"collection_item" => params}, socket) do
    params = normalize_location_id(params)

    case Catalog.update_collection_item(socket.assigns.collection_item, params) do
      {:ok, _item} ->
        {:noreply,
         socket
         |> put_flash(:info, "Updated #{printing_name(socket.assigns.printing)}.")
         |> push_navigate(to: ~p"/collection")}

      {:error, changeset} ->
        {:noreply, assign(socket, :form, to_form(changeset))}
    end
  end

  @impl true
  def render(%{form: nil} = assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="space-y-4">
        <.back_link navigate={~p"/collection"}>Back to collection</.back_link>
        <p class="alert alert-error">Printing not found.</p>
      </div>
    </Layouts.app>
    """
  end

  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="mx-auto max-w-3xl space-y-6">
        <.back_link navigate={~p"/collection"}>Back to collection</.back_link>

        <section :if={@mode == :location} class="card border border-base-300 bg-base-100 shadow-xl">
          <div class="card-body gap-6">
            <div class="space-y-2">
              <h1 class="card-title text-3xl">{@page_title}</h1>
              <p class="text-base-content/70">
                Create a box, binder, deck box, or list to organize your cards.
              </p>
            </div>

            <.form
              for={@form}
              id="location-form"
              as={:location}
              phx-change="validate"
              phx-submit="save"
              class="space-y-4"
            >
              <.input field={@form[:name]} type="text" label="Name" placeholder="Trade Binder" required />
              <.input
                field={@form[:kind]}
                type="select"
                label="Kind"
                options={kind_options()}
              />
              <.input
                field={@form[:description]}
                type="textarea"
                label="Description"
                rows="2"
                placeholder="What's in this location…"
              />

              <div class="flex justify-end gap-3">
                <.link navigate={~p"/collection"} class="btn btn-ghost">Cancel</.link>
                <button class="btn btn-primary" type="submit">Create location</button>
              </div>
            </.form>
          </div>
        </section>

        <section :if={@mode != :location} class="card border border-base-300 bg-base-100 shadow-xl">
          <div class="card-body gap-6">
            <div class="space-y-2">
              <h1 class="card-title text-3xl">{@page_title}</h1>
              <p class="text-base-content/70">
                {printing_name(@printing)} — {set_label(@printing)} — exact printing {@printing.scryfall_id}
              </p>
            </div>

            <.form
              for={@form}
              id="collection-item-form"
              phx-change="validate"
              phx-submit="save"
              class="space-y-4"
            >
              <%= if @collection_item == nil do %>
                <.input field={@form[:scryfall_id]} type="hidden" />
              <% end %>

              <div class="grid gap-4 md:grid-cols-2">
                <.input field={@form[:quantity]} type="number" label="Quantity" min="1" required />
                <.input
                  field={@form[:condition]}
                  type="select"
                  label="Condition"
                  options={condition_options()}
                />
                <.input field={@form[:language]} type="text" label="Language" required />
                <.input
                  field={@form[:finish]}
                  type="select"
                  label="Finish"
                  options={finish_options(@printing)}
                />
              </div>

              <.input
                field={@form[:location_id]}
                type="select"
                label="Location"
                options={location_options(@locations)}
                prompt="(no location)"
              />
              <.input field={@form[:notes]} type="textarea" label="Notes" rows="4" />

              <div class="flex justify-end gap-3">
                <.link navigate={~p"/collection"} class="btn btn-ghost">Cancel</.link>
                <button class="btn btn-primary" type="submit">Save</button>
              </div>
            </.form>
          </div>
        </section>
      </div>
    </Layouts.app>
    """
  end

  defp condition_options, do: @conditions

  defp kind_options do
    [
      {"📦 Box", "box"},
      {"📒 Binder", "binder"},
      {"🎴 Deck box", "deck_box"},
      {"📋 List", "list"},
      {"📁 Folder", "folder"},
      {"📌 Other", "other"}
    ]
  end

  defp finish_options(%{finishes: finishes}) do
    finishes
    |> decode_finishes()
    |> Enum.map(&{Map.get(@finish_labels, &1, &1), &1})
  end

  defp finish_options(_printing), do: []

  defp location_options(locations) do
    Enum.map(locations, fn loc ->
      {"#{kind_icon(loc.kind)} #{loc.name}", loc.id}
    end)
  end

  defp kind_icon("box"), do: "📦"
  defp kind_icon("binder"), do: "📒"
  defp kind_icon("deck_box"), do: "🎴"
  defp kind_icon("list"), do: "📋"
  defp kind_icon("folder"), do: "📁"
  defp kind_icon(_), do: "📌"

  defp normalize_location_id(%{"location_id" => ""} = params), do: Map.put(params, "location_id", nil)
  defp normalize_location_id(params), do: params

  defp decode_finishes(finishes) when is_binary(finishes) do
    case Jason.decode(finishes) do
      {:ok, finishes} when is_list(finishes) -> Enum.filter(finishes, &is_binary/1)
      _other -> []
    end
  end

  defp decode_finishes(_finishes), do: []

  defp printing_name(%{card: %{name: name}}), do: name
  defp printing_name(_printing), do: "Unknown card"

  defp set_label(%{set_code: set_code, collector_number: collector_number}) do
    "#{String.upcase(set_code)} ##{collector_number}"
  end
end
