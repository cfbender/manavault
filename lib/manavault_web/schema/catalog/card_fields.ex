defmodule ManavaultWeb.Schema.Catalog.CardFields do
  @moduledoc false

  import Absinthe.Resolution.Helpers, only: [on_load: 2]

  alias Manavault.Catalog
  alias Manavault.Catalog.{Card, Price, Printing}
  alias ManavaultWeb.Schema.Catalog.ValueResolvers
  alias ManavaultWeb.Schema.RelayHelpers

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

  def card_printings(%Card{printings: printings}, args, _resolution) when is_list(printings) do
    RelayHelpers.connection_from_list(printings, args)
  end

  def card_printings(%Card{} = card, args, %{context: %{loader: loader}}) do
    loader
    |> Dataloader.load(Catalog, {:many, Card}, printings_with_owned_count: card)
    |> on_load(fn loader ->
      loader
      |> Dataloader.get(Catalog, {:many, Card}, printings_with_owned_count: card)
      |> RelayHelpers.connection_from_list(args)
    end)
  end

  def card_printings(%Card{oracle_id: oracle_id}, args, _resolution) do
    oracle_id
    |> Catalog.get_card_with_printings()
    |> Map.get(:printings, [])
    |> RelayHelpers.connection_from_list(args)
  end

  # A single representative printing (the first with a usable image, matching the
  # UI's old client-side scan). Lets image-only consumers like the EDHRec views
  # avoid fetching every printing. Shares the printings Dataloader batch, so it
  # adds no query and stays free of N+1 across many cards.
  def card_primary_printing(%Card{printings: printings}, _args, _resolution)
      when is_list(printings) do
    {:ok, primary_printing(printings)}
  end

  def card_primary_printing(%Card{} = card, _args, %{context: %{loader: loader}}) do
    loader
    |> Dataloader.load(Catalog, {:many, Card}, printings_with_owned_count: card)
    |> on_load(fn loader ->
      printings = Dataloader.get(loader, Catalog, {:many, Card}, printings_with_owned_count: card)
      {:ok, primary_printing(printings)}
    end)
  end

  def card_primary_printing(%Card{oracle_id: oracle_id}, _args, _resolution) do
    printing =
      oracle_id
      |> Catalog.get_card_with_printings()
      |> Map.get(:printings, [])
      |> primary_printing()

    {:ok, printing}
  end

  defp primary_printing(printings) when is_list(printings) do
    Enum.find(printings, List.first(printings), &printing_has_image?/1)
  end

  defp primary_printing(_printings), do: nil

  defp printing_has_image?(%Printing{} = printing) do
    image_uris = ValueResolvers.decode_json(printing.image_uris, %{})
    image_url(image_uris) != nil or art_crop_url(image_uris) != nil
  end

  defp printing_has_image?(_printing), do: false

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

  def printing_back_image_url(%Printing{} = printing, _args, _resolution) do
    image_uris = ValueResolvers.decode_json(printing.image_uris, %{})
    {:ok, back_image_url(image_uris)}
  end

  def printing_back_image_url(_printing, _args, _resolution), do: {:ok, nil}

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

  defp back_image_url([_front, back | _rest]), do: image_url(back)
  defp back_image_url(_image_uris), do: nil

  defp art_crop_url(%{} = image_uris) do
    image_uris["art_crop"] || image_url(image_uris)
  end

  defp art_crop_url([first | _rest]), do: art_crop_url(first)
  defp art_crop_url(_image_uris), do: nil
end
