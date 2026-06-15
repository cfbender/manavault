defmodule ManavaultWeb.CardShowLive do
  use ManavaultWeb, :live_view

  alias Manavault.Catalog
  alias Manavault.Catalog.Printing

  @impl true
  def mount(%{"id" => oracle_id}, _session, socket) do
    case Catalog.get_card_with_printings(oracle_id) do
      nil ->
        {:ok,
         socket
         |> assign(:page_title, "Card not found")
         |> assign(:card, nil)}

      card ->
        {:ok,
         socket
         |> assign(:page_title, card.name)
         |> assign(:card, card)}
    end
  end

  @impl true
  def render(%{card: nil} = assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="space-y-4">
        <.link navigate={~p"/cards"} class="link link-primary">← Back to search</.link>
        <p class="alert alert-error">Card not found.</p>
      </div>
    </Layouts.app>
    """
  end

  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="space-y-8">
        <.link navigate={~p"/cards"} class="link link-primary">← Back to search</.link>

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
              <h2 class="card-title text-2xl">Rules text</h2>
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

          <div class="grid gap-4 md:grid-cols-2">
            <article :for={printing <- @card.printings} class="card bg-base-200 shadow-sm">
              <div class="card-body gap-4">
                <div class="flex gap-4">
                  <img
                    :if={image_url(printing)}
                    src={image_url(printing)}
                    alt={image_alt(@card.name, printing)}
                    class="w-24 rounded-lg shadow"
                  />
                  <div class="space-y-2">
                    <h3 class="card-title text-lg">{set_label(printing)}</h3>
                    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                      <dt class="font-semibold">Collector #</dt>
                      <dd>{printing.collector_number}</dd>
                      <dt class="font-semibold">Language</dt>
                      <dd>{printing.lang}</dd>
                      <dt class="font-semibold">Finishes</dt>
                      <dd>{finish_label(printing)}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </article>
          </div>

          <p :if={@card.printings == []} class="alert alert-info">
            No printings are available for this card.
          </p>
        </section>
      </div>
    </Layouts.app>
    """
  end

  defp banner_image_url(%{printings: [printing | _]}), do: image_url(printing, :banner)
  defp banner_image_url(_card), do: nil

  defp oracle_paragraphs(text) when is_binary(text) do
    text
    |> String.split(~r/\n\s*\n/, trim: true)
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == ""))
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

  defp image_alt(card_name, printing), do: "#{card_name} #{set_label(printing)} image"

  defp decode_json(value, fallback) when is_binary(value) do
    case Jason.decode(value) do
      {:ok, decoded} -> decoded
      {:error, _reason} -> fallback
    end
  end

  defp decode_json(_value, fallback), do: fallback
end
