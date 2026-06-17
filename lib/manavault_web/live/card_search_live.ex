defmodule ManavaultWeb.CardSearchLive do
  use ManavaultWeb, :live_view

  alias Manavault.Catalog
  alias Manavault.Catalog.Printing

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Card search")
     |> assign(:search_params, %{})
     |> assign(:search_form, to_form(%{"q" => ""}, as: :search))
     |> assign(:card_results, [])
     |> assign(:searched?, false)}
  end

  @impl true
  def handle_params(params, _uri, socket) do
    search_params = search_params(params)
    query = Map.get(search_params, "q", "")
    results = if query == "", do: [], else: Catalog.search_cards(query, limit: 25)

    {:noreply,
     socket
     |> assign(:search_params, search_params)
     |> assign(:search_form, to_form(%{"q" => query}, as: :search))
     |> assign(:card_results, results)
     |> assign(:searched?, map_size(search_params) > 0)}
  end

  @impl true
  def handle_event("search_cards", %{"search" => params}, socket) do
    search_params = search_params(params)

    {:noreply, push_patch(socket, to: ~p"/cards?#{search_params}")}
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
                ManaVault catalog
              </div>
              <div class="space-y-3">
                <h1 class="text-4xl font-black tracking-tight sm:text-5xl">
                  Find cards
                </h1>
                <p class="text-base leading-7 text-base-content/70">
                  Search the local Scryfall catalog by card name and open the overall card view.
                </p>
              </div>
            </div>

            <.form
              for={@search_form}
              id="card-search-form"
              phx-submit="search_cards"
              class="rounded-box border border-base-300 bg-base-100 p-4 shadow-sm sm:p-5"
            >
              <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <.live_component
                  module={ManavaultWeb.CardNameAutocomplete}
                  id="card-search-name-autocomplete"
                  field={@search_form[:q]}
                  label="Card name"
                  placeholder="Black Lotus"
                />
                <div>
                  <span class="label invisible hidden md:flex">Search</span>
                  <button class="btn btn-primary w-full md:w-auto" type="submit">Search</button>
                </div>
              </div>
            </.form>
          </div>
        </section>

        <section class="space-y-3">
          <div :if={@card_results != []} class="flex items-center justify-between gap-3">
            <h2 class="text-xl font-bold tracking-tight">Card results</h2>
            <span class="badge badge-ghost">
              {length(@card_results)} matches
            </span>
          </div>

          <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <.link
              :for={card <- @card_results}
              navigate={~p"/cards/#{card.oracle_id}?#{@search_params}"}
              class="group card overflow-hidden border border-base-300 bg-base-100 shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
            >
              <figure class="aspect-[5/7] bg-base-200">
                <img
                  :if={card_image_url(card)}
                  src={card_image_url(card)}
                  alt={card.name}
                  class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                  loading="lazy"
                />
                <div
                  :if={!card_image_url(card)}
                  class="flex h-full w-full items-center justify-center p-6 text-center text-sm text-base-content/50"
                >
                  No image available
                </div>
              </figure>
              <div class="card-body gap-2 p-4">
                <h3 class="line-clamp-2 text-base font-bold leading-snug">{card.name}</h3>
                <p :if={card.type_line} class="line-clamp-2 text-sm leading-6 text-base-content/70">
                  {card.type_line}
                </p>
              </div>
            </.link>
          </div>

          <div
            :if={@searched? and @card_results == []}
            class="alert border border-info/20 bg-info/10 text-info-content"
          >
            <span>No cards matched that search.</span>
          </div>
        </section>
      </div>
    </Layouts.app>
    """
  end

  defp search_params(params) when is_map(params) do
    params
    |> Map.take(["q"])
    |> Enum.map(fn {key, value} -> {key, normalize_search_value(value)} end)
    |> Enum.reject(fn {_key, value} -> value == "" end)
    |> Map.new()
  end

  defp normalize_search_value(value) when is_binary(value), do: String.trim(value)
  defp normalize_search_value(_value), do: ""

  defp card_image_url(%{printings: [printing | _]}), do: printing_image_url(printing)
  defp card_image_url(_card), do: nil

  defp printing_image_url(%Printing{image_uris: image_uris}) do
    with {:ok, uris} <- Jason.decode(image_uris) do
      image_url_from_uris(uris)
    else
      _ -> nil
    end
  end

  defp image_url_from_uris(uris) when is_map(uris) do
    uris["normal"] || uris["large"] || uris["small"] || uris["png"]
  end

  defp image_url_from_uris([uris | _]), do: image_url_from_uris(uris)
  defp image_url_from_uris(_uris), do: nil
end
