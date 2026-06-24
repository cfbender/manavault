defmodule ManavaultWeb.Schema.Catalog.DeckFields do
  @moduledoc false

  import Absinthe.Resolution.Helpers, only: [on_load: 2]

  alias Manavault.Catalog
  alias Manavault.Catalog.{Deck, DeckCard, Price}
  alias ManavaultWeb.Schema.RelayHelpers

  def buylist_entry_unit_price_text(parent, _args, _resolution) do
    {:ok, parent |> Map.get(:unit_price_cents) |> Price.format_cents()}
  end

  def buylist_entry_total_price_text(parent, _args, _resolution) do
    {:ok, parent |> Map.get(:total_price_cents) |> Price.format_cents()}
  end

  def deck_cards(%Deck{deck_cards: deck_cards}, args, _resolution) when is_list(deck_cards) do
    deck_cards
    |> Catalog.put_deck_card_allocation_statuses()
    |> RelayHelpers.connection_from_list(args)
  end

  def deck_cards(%Deck{} = deck, args, %{context: %{loader: loader}}) do
    loader
    |> Dataloader.load(Catalog, :deck_cards, deck)
    |> on_load(fn loader ->
      loader
      |> Dataloader.get(Catalog, :deck_cards, deck)
      |> Catalog.put_deck_card_allocation_statuses()
      |> RelayHelpers.connection_from_list(args)
    end)
  end

  def deck_cards(%Deck{} = deck, args, _resolution) do
    deck
    |> Catalog.deck_cards()
    |> RelayHelpers.connection_from_list(args)
  end

  def deck_card_count(%Deck{} = deck, _args, _resolution) do
    {:ok, Catalog.deck_card_count(deck)}
  end

  def deck_unique_card_count(%Deck{} = deck, _args, _resolution) do
    {:ok, Catalog.deck_unique_card_count(deck)}
  end

  def deck_cover_image_url(%Deck{} = deck, _args, _resolution) do
    {:ok, Catalog.deck_cover_image_url(deck)}
  end

  def deck_commander_color_identity(%Deck{} = deck, _args, _resolution) do
    {:ok, Catalog.deck_commander_color_identity(deck)}
  end

  def deck_legality(%Deck{deck_cards: deck_cards} = deck, _args, _resolution)
      when is_list(deck_cards) do
    {:ok, Catalog.deck_legality(deck)}
  end

  def deck_legality(%Deck{} = deck, _args, %{context: %{loader: loader}}) do
    loader
    |> Dataloader.load(Catalog, :deck_cards, deck)
    |> on_load(fn loader ->
      deck_cards = Dataloader.get(loader, Catalog, :deck_cards, deck)
      {:ok, Catalog.deck_legality(%{deck | deck_cards: deck_cards})}
    end)
  end

  def deck_legality(%Deck{} = deck, _args, _resolution) do
    {:ok, Catalog.deck_legality(deck)}
  end

  def deck_card_allocation_status(%DeckCard{allocation_status: status}, _args, _resolution)
      when is_map(status) do
    {:ok, %{status | state: to_string(status.state)}}
  end

  def deck_card_allocation_status(%DeckCard{} = deck_card, _args, _resolution) do
    status = Catalog.deck_card_allocation_status(deck_card)
    {:ok, %{status | state: to_string(status.state)}}
  end
end
