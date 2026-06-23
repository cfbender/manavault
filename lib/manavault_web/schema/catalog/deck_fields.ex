defmodule ManavaultWeb.Schema.Catalog.DeckFields do
  @moduledoc false

  alias Manavault.Catalog
  alias Manavault.Catalog.{Deck, DeckCard, Price}

  def buylist_entry_unit_price_text(parent, _args, _resolution) do
    {:ok, parent |> Map.get(:unit_price_cents) |> Price.format_cents()}
  end

  def buylist_entry_total_price_text(parent, _args, _resolution) do
    {:ok, parent |> Map.get(:total_price_cents) |> Price.format_cents()}
  end

  def deck_cards(%Deck{} = deck, _args, _resolution) do
    {:ok, Catalog.deck_cards(deck)}
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
