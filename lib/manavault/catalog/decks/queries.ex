defmodule Manavault.Catalog.Decks.Queries do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, Deck, DeckCard, DeckLegality, DeckSummaries}
  alias Manavault.Catalog.Decks.{AllocationStatus, Preloads}
  alias Manavault.Repo

  def list_decks do
    Deck
    |> order_by([deck], asc: deck.name, asc: deck.id)
    |> Repo.all()
  end

  def list_deck_summaries do
    list_decks()
    |> DeckSummaries.put_fields()
  end

  def count_decks do
    Repo.aggregate(Deck, :count)
  end

  def get_deck_by_share_token(token, opts \\ [])

  def get_deck_by_share_token(nil, _opts), do: nil

  def get_deck_by_share_token(token, opts) when is_binary(token) and is_list(opts) do
    token = String.trim(token)

    if token == "" do
      nil
    else
      Deck
      |> Repo.get_by(share_token: token)
      |> maybe_preload_deck(opts)
    end
  end

  def get_deck!(id, opts \\ []) when is_list(opts) do
    Deck
    |> Repo.get!(id)
    |> maybe_preload_deck(opts)
  end

  def deck_cards(%Deck{deck_cards: cards}) when is_list(cards) do
    cards
    |> DeckSummaries.put_fallback_printings()
    |> AllocationStatus.put_deck_card_allocation_statuses()
  end

  def deck_cards(%Deck{} = deck) do
    deck
    |> Repo.preload(Preloads.deck_preloads())
    |> Map.fetch!(:deck_cards)
    |> DeckSummaries.put_fallback_printings()
    |> AllocationStatus.put_deck_card_allocation_statuses()
  end

  def deck_legality(%Deck{deck_cards: deck_cards} = deck) when is_list(deck_cards) do
    if Enum.all?(deck_cards, &match?(%DeckCard{card: %Card{}}, &1)) do
      DeckLegality.evaluate(deck)
    else
      deck
      |> Repo.preload(Preloads.deck_preloads(), force: true)
      |> DeckLegality.evaluate()
    end
  end

  def deck_legality(%Deck{} = deck) do
    deck
    |> Repo.preload(Preloads.deck_preloads())
    |> DeckLegality.evaluate()
  end

  def deck_card_count(%Deck{card_count: count}) when is_integer(count), do: count

  def deck_card_count(%Deck{deck_cards: cards}) when is_list(cards) do
    cards
    |> Enum.filter(&DeckCard.counts_toward_deck_total?/1)
    |> Enum.reduce(0, &(&1.quantity + &2))
  end

  def deck_card_count(%Deck{id: id}) do
    count =
      DeckCard
      |> where(
        [deck_card],
        deck_card.deck_id == ^id and deck_card.zone in ^DeckCard.deck_count_zones()
      )
      |> Repo.aggregate(:sum, :quantity)

    count || 0
  end

  def deck_unique_card_count(%Deck{unique_card_count: count}) when is_integer(count), do: count

  def deck_unique_card_count(%Deck{deck_cards: cards}) when is_list(cards) do
    cards
    |> Enum.filter(&DeckCard.counts_toward_deck_total?/1)
    |> length()
  end

  def deck_unique_card_count(%Deck{id: id}) do
    DeckCard
    |> where(
      [deck_card],
      deck_card.deck_id == ^id and deck_card.zone in ^DeckCard.deck_count_zones()
    )
    |> Repo.aggregate(:count, :id)
  end

  def deck_commander_color_identity(%Deck{commander_color_identity: colors}) when is_list(colors),
    do: colors

  def deck_commander_color_identity(%Deck{deck_cards: cards}) when is_list(cards) do
    cards
    |> Enum.filter(&(&1.zone == "commander"))
    |> DeckSummaries.commander_color_identity_from_cards()
  end

  def deck_commander_color_identity(%Deck{id: id}) do
    id
    |> DeckSummaries.display()
    |> Map.fetch!(:commander_color_identity)
  end

  def deck_cover_image_url(%Deck{cover_image_url: url}) when is_binary(url), do: url

  def deck_cover_image_url(%Deck{deck_cards: cards}) when is_list(cards) do
    DeckSummaries.cover_image_url_from_cards(cards)
  end

  def deck_cover_image_url(%Deck{id: id}) do
    id
    |> DeckSummaries.display()
    |> Map.fetch!(:cover_image_url)
  end

  defp maybe_preload_deck(nil, _opts), do: nil

  defp maybe_preload_deck(%Deck{} = deck, opts) do
    if Keyword.get(opts, :preload?, true) do
      Repo.preload(deck, Preloads.deck_preloads())
    else
      deck
    end
  end
end
