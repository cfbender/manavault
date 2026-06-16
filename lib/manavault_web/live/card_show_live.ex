defmodule ManavaultWeb.CardShowLive do
  use ManavaultWeb, :live_view

  alias Manavault.Catalog
  alias Manavault.Catalog.Printing

  @impl true
  def mount(%{"id" => oracle_id} = params, _session, socket) do
    back_params = search_params(params)

    case Catalog.get_card_with_printings(oracle_id) do
      nil ->
        {:ok,
         socket
         |> assign(:page_title, "Card not found")
         |> assign(:card, nil)
         |> assign(:back_params, back_params)}

      card ->
        {:ok,
         socket
         |> assign(:page_title, card.name)
         |> assign(:card, card)
         |> assign(:back_params, back_params)
         |> assign(:selected_printing, nil)}
    end
  end

  @impl true
  def handle_event("show_details", %{"scryfall_id" => scryfall_id}, socket) do
    printing = Enum.find(socket.assigns.card.printings, &(&1.scryfall_id == scryfall_id))
    {:noreply, assign(socket, :selected_printing, printing)}
  end

  def handle_event("close_modal", _params, socket) do
    {:noreply, assign(socket, :selected_printing, nil)}
  end

  @impl true
  def render(%{card: nil} = assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="space-y-4">
        <.back_link navigate={~p"/cards?#{@back_params}"}>Back to search</.back_link>
        <p class="alert alert-error">Card not found.</p>
      </div>
    </Layouts.app>
    """
  end

  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="space-y-8">
        <.back_link navigate={~p"/cards?#{@back_params}"}>Back to search</.back_link>

        <section class="relative overflow-hidden rounded-box border border-base-300 bg-base-200 shadow-xl">
          <img
            :if={banner_image_url(@card)}
            src={banner_image_url(@card)}
            alt={"#{@card.name} artwork"}
            class="absolute inset-0 h-full w-full object-cover"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-base-100 via-base-100/75 to-transparent">
          </div>
          <div class="absolute inset-0 bg-gradient-to-r from-base-100/90 via-base-100/35 to-transparent">
          </div>

          <div class="relative flex min-h-80 items-end p-6 sm:p-8 lg:min-h-96">
            <div class="max-w-3xl space-y-3">
              <h1 class="text-4xl font-black tracking-tight sm:text-5xl">{@card.name}</h1>
              <p :if={@card.type_line} class="text-lg leading-8 text-base-content/80">
                {@card.type_line}
              </p>
            </div>
          </div>
        </section>

        <section :if={@card.oracle_text} class="card border border-base-300 bg-base-100 shadow-sm">
          <div class="card-body gap-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-primary">Oracle text</p>
            </div>

            <div class="space-y-4 text-base leading-8 text-base-content/90">
              <p :for={paragraph <- oracle_paragraphs(@card.oracle_text)}>{paragraph}</p>
            </div>
          </div>
        </section>

        <section class="space-y-4">
          <div>
            <h2 class="text-2xl font-semibold">Known printings</h2>
            <p class="text-sm text-base-content/70">
              {length(@card.printings)} printings in the local catalog.
            </p>
          </div>

          <div class="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            <div
              :for={printing <- @card.printings}
              class="card bg-base-200 shadow-sm overflow-hidden group"
            >
              <figure
                :if={image_url(printing)}
                phx-click="show_details"
                phx-value-scryfall_id={printing.scryfall_id}
                class="aspect-[5/7] bg-base-300 cursor-pointer relative"
              >
                <img
                  src={image_url(printing)}
                  alt={image_alt(@card.name, printing)}
                  class="h-full w-full object-cover transition group-hover:scale-[1.02]"
                  loading="lazy"
                />
                <span class="absolute bottom-1.5 left-1.5 badge badge-sm badge-outline bg-base-100/80 backdrop-blur-sm font-bold">
                  {String.upcase(printing.set_code)}
                </span>
                <span
                  :if={price_text(printing)}
                  class="absolute bottom-1.5 right-1.5 badge badge-sm bg-base-100/80 backdrop-blur-sm font-mono text-xs"
                >
                  {price_text(printing)}
                </span>
                <div class="absolute inset-0 bg-black/0 transition group-hover:bg-black/20 flex items-start p-2">
                  <span class="text-xs text-white opacity-0 group-hover:opacity-100 transition">
                    Click for details
                  </span>
                </div>
              </figure>
              <div class="card-body gap-2 p-3">
                <.link
                  navigate={~p"/collection/new?printing_id=#{printing.scryfall_id}"}
                  class="btn btn-primary btn-xs w-full"
                >
                  + Add
                </.link>
              </div>
            </div>
          </div>

          <p :if={@card.printings == []} class="alert alert-info">
            No printings are available for this card.
          </p>
        </section>

        <%!-- Printing details modal --%>
        <dialog
          :if={@selected_printing}
          id="printing-modal"
          class="modal modal-open"
          phx-click-away="close_modal"
          phx-key="Escape"
        >
          <div class="modal-box max-w-md">
            <div class="flex gap-4">
              <img
                :if={image_url(@selected_printing)}
                src={image_url(@selected_printing)}
                alt={image_alt(@card.name, @selected_printing)}
                class="w-28 h-40 shrink-0 rounded-lg shadow object-cover"
              />
              <div class="space-y-3 flex-1">
                <h3 class="text-lg font-bold">{set_label(@selected_printing)}</h3>
                <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt class="font-semibold">Collector #</dt>
                  <dd>{@selected_printing.collector_number}</dd>
                  <dt class="font-semibold">Language</dt>
                  <dd>{@selected_printing.lang}</dd>
                  <dt class="font-semibold">Finishes</dt>
                  <dd>{finish_label(@selected_printing)}</dd>
                  <dt class="font-semibold">Scryfall ID</dt>
                  <dd class="break-all text-xs">{@selected_printing.scryfall_id}</dd>
                </dl>
                <.link
                  navigate={~p"/collection/new?printing_id=#{@selected_printing.scryfall_id}"}
                  class="btn btn-primary btn-sm w-full mt-2"
                >
                  + Add to collection
                </.link>
              </div>
            </div>
            <div class="modal-action">
              <button class="btn btn-sm" phx-click="close_modal">Close</button>
            </div>
          </div>
          <form method="dialog" class="modal-backdrop">
            <button phx-click="close_modal">close</button>
          </form>
        </dialog>
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

  defp banner_image_url(%{printings: [printing | _]}), do: image_url(printing, :banner)
  defp banner_image_url(_card), do: nil

  defp oracle_paragraphs(text) when is_binary(text) do
    text
    |> String.split("\n")
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 in ["", "---"]))
  end

  defp set_label(%Printing{set_code: set_code, set_name: nil}), do: String.upcase(set_code)
  defp set_label(%Printing{set_code: set_code, set_name: ""}), do: String.upcase(set_code)

  defp set_label(%Printing{set_code: set_code, set_name: set_name}),
    do: "#{set_name} (#{String.upcase(set_code)})"

  defp finish_label(%Printing{finishes: finishes}) do
    finishes
    |> decode_json([])
    |> Enum.join(", ")
    |> case do
      "" -> "Unknown"
      label -> label
    end
  end

  defp price_text(%Printing{prices: prices}) do
    prices
    |> decode_json(%{})
    |> then(fn
      %{"usd" => usd} when is_binary(usd) and usd != "" ->
        "$#{format_price(usd)}"

      %{"usd_foil" => foil} when is_binary(foil) and foil != "" ->
        "$#{format_price(foil)}"

      map when is_map(map) ->
        map
        |> Map.values()
        |> Enum.find(&is_binary/1)
        |> then(fn
          nil -> nil
          v -> "$#{format_price(v)}"
        end)

      _ ->
        nil
    end)
  end

  defp format_price(price) do
    case Float.parse(price) do
      {num, _} when num >= 100 -> trunc(num) |> Integer.to_string()
      {num, _} -> :erlang.float_to_binary(num, decimals: 2)
      :error -> price
    end
  end

  defp image_url(printing), do: image_url(printing, :card)

  defp image_url(%Printing{image_uris: image_uris}, variant) do
    image_uris
    |> decode_json(%{})
    |> image_url_from_uris(variant)
  end

  defp image_url_from_uris(uris, variant) when is_map(uris) do
    preferred_image_keys(variant)
    |> Enum.find_value(&Map.get(uris, &1))
  end

  defp image_url_from_uris([uris | _rest], variant), do: image_url_from_uris(uris, variant)
  defp image_url_from_uris(_uris, _variant), do: nil

  defp preferred_image_keys(:banner), do: ["art_crop", "normal", "large", "small", "png"]
  defp preferred_image_keys(_variant), do: ["normal", "large", "small", "png", "art_crop"]

  defp image_alt(card_name, printing), do: "#{card_name} (#{String.upcase(printing.set_code)})"

  defp decode_json(value, fallback) when is_binary(value) do
    case Jason.decode(value) do
      {:ok, decoded} -> decoded
      {:error, _reason} -> fallback
    end
  end

  defp decode_json(_value, fallback), do: fallback
end
