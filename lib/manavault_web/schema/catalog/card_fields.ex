defmodule ManavaultWeb.Schema.Catalog.CardFields do
  @moduledoc false

  import Absinthe.Resolution.Helpers, only: [on_load: 2]

  alias Manavault.Catalog
  alias Manavault.Catalog.{Card, Price, Printing}
  alias ManavaultWeb.Schema.Catalog.ValueResolvers

  def card_rulings(%Card{} = card, _args, _resolution) do
    {:ok, Catalog.card_rulings(card)}
  end

  def card_rulings(_card, _args, _resolution), do: {:ok, []}

  def card_legalities(%Card{} = card, _args, _resolution) do
    legalities =
      card
      |> Map.get(:legalities)
      |> ValueResolvers.decode_json(%{})
      |> legality_entries()

    {:ok, legalities}
  end

  def card_legalities(_card, _args, _resolution), do: {:ok, []}

  def card_printings(%Card{printings: printings}, _args, _resolution) when is_list(printings) do
    {:ok, printings}
  end

  def card_printings(%Card{} = card, _args, %{context: %{loader: loader}}) do
    loader
    |> Dataloader.load(Catalog, {:many, Card}, printings_with_owned_count: card)
    |> on_load(fn loader ->
      {:ok, Dataloader.get(loader, Catalog, {:many, Card}, printings_with_owned_count: card)}
    end)
  end

  def card_printings(%Card{oracle_id: oracle_id}, _args, _resolution) do
    printings =
      oracle_id
      |> Catalog.get_card_with_printings()
      |> Map.get(:printings, [])

    {:ok, printings}
  end

  def printing_card(%Printing{card: %Card{} = card}, _args, _resolution) do
    {:ok, card}
  end

  def printing_card(%Printing{} = printing, _args, %{context: %{loader: loader}}) do
    loader
    |> Dataloader.load(Catalog, :card, printing)
    |> on_load(fn loader ->
      {:ok, Dataloader.get(loader, Catalog, :card, printing)}
    end)
  end

  def printing_image_url(%Printing{} = printing, _args, _resolution) do
    image_uris = ValueResolvers.decode_json(printing.image_uris, %{})
    {:ok, image_url(image_uris)}
  end

  def printing_image_url(_printing, _args, _resolution), do: {:ok, nil}

  def printing_art_crop_url(%Printing{} = printing, _args, _resolution) do
    image_uris = ValueResolvers.decode_json(printing.image_uris, %{})
    {:ok, art_crop_url(image_uris)}
  end

  def printing_art_crop_url(_printing, _args, _resolution), do: {:ok, nil}

  def printing_price_text(%Printing{} = printing, _args, _resolution) do
    {:ok, Price.text_for_printing(printing)}
  end

  defp legality_entries(%{} = legalities) do
    legalities
    |> Enum.flat_map(fn
      {format, status} when is_binary(format) and is_binary(status) ->
        [%{format: format, status: status}]

      _entry ->
        []
    end)
    |> Enum.sort_by(& &1.format)
  end

  defp legality_entries(_legalities), do: []

  defp image_url(%{} = image_uris) do
    image_uris["normal"] || image_uris["large"] || image_uris["small"] || image_uris["png"]
  end

  defp image_url([first | _rest]), do: image_url(first)
  defp image_url(_image_uris), do: nil

  defp art_crop_url(%{} = image_uris) do
    image_uris["art_crop"] || image_url(image_uris)
  end

  defp art_crop_url([first | _rest]), do: art_crop_url(first)
  defp art_crop_url(_image_uris), do: nil
end
