defmodule ManavaultWeb.Schema.Catalog.DeckFields do
  @moduledoc false

  import Absinthe.Resolution.Helpers, only: [on_load: 2]

  alias Absinthe.Relay.Node
  alias Manavault.Catalog
  alias Manavault.Catalog.{Deck, DeckCard, Price}
  alias ManavaultWeb.Schema.RelayHelpers

  def buylist_entry_unit_price_text(parent, _args, _resolution) do
    {:ok, parent |> Map.get(:unit_price_cents) |> Price.format_cents()}
  end

  def buylist_entry_total_price_text(parent, _args, _resolution) do
    {:ok, parent |> Map.get(:total_price_cents) |> Price.format_cents()}
  end

  def deck_card_price_cents(%DeckCard{} = deck_card, _args, _resolution) do
    {:ok, Price.deck_card_price_cents(deck_card)}
  end

  def deck_cards(%Deck{deck_cards: deck_cards}, args, _resolution) when is_list(deck_cards) do
    deck_cards
    |> Catalog.put_deck_card_fallback_printings()
    |> Catalog.put_deck_card_allocation_statuses()
    |> Catalog.put_deck_card_tag_ids()
    |> RelayHelpers.connection_from_list(args)
  end

  def deck_cards(%Deck{} = deck, args, %{context: %{loader: loader}}) do
    case Catalog.fetch_cached_deck_cards(deck) do
      {:ok, deck_cards} ->
        RelayHelpers.connection_from_list(deck_cards, args)

      _miss ->
        loader
        |> Dataloader.load(Catalog, :deck_cards, deck)
        |> on_load(fn loader ->
          loader
          |> Dataloader.get(Catalog, :deck_cards, deck)
          |> Catalog.put_deck_card_fallback_printings()
          |> Catalog.put_deck_card_allocation_statuses()
          |> Catalog.put_deck_card_tag_ids()
          |> then(&Catalog.put_cached_deck_cards(deck, &1))
          |> RelayHelpers.connection_from_list(args)
        end)
    end
  end

  def deck_cards(%Deck{} = deck, args, _resolution) do
    deck
    |> Catalog.deck_cards()
    |> RelayHelpers.connection_from_list(args)
  end

  def deck_card_count(%Deck{deck_cards: deck_cards} = deck, _args, _resolution)
      when is_list(deck_cards) do
    {:ok, Catalog.deck_card_count(deck)}
  end

  def deck_card_count(%Deck{} = deck, _args, %{context: %{loader: loader}}) do
    case Catalog.fetch_cached_deck_cards(deck) do
      {:ok, deck_cards} ->
        {:ok, Catalog.deck_card_count(%{deck | deck_cards: deck_cards})}

      _miss ->
        loader
        |> Dataloader.load(Catalog, :deck_cards, deck)
        |> on_load(fn loader ->
          deck_cards = Dataloader.get(loader, Catalog, :deck_cards, deck)
          {:ok, Catalog.deck_card_count(%{deck | deck_cards: deck_cards})}
        end)
    end
  end

  def deck_card_count(%Deck{} = deck, _args, _resolution) do
    {:ok, Catalog.deck_card_count(deck)}
  end

  def deck_unique_card_count(%Deck{deck_cards: deck_cards} = deck, _args, _resolution)
      when is_list(deck_cards) do
    {:ok, Catalog.deck_unique_card_count(deck)}
  end

  def deck_unique_card_count(%Deck{} = deck, _args, %{context: %{loader: loader}}) do
    case Catalog.fetch_cached_deck_cards(deck) do
      {:ok, deck_cards} ->
        {:ok, Catalog.deck_unique_card_count(%{deck | deck_cards: deck_cards})}

      _miss ->
        loader
        |> Dataloader.load(Catalog, :deck_cards, deck)
        |> on_load(fn loader ->
          deck_cards = Dataloader.get(loader, Catalog, :deck_cards, deck)
          {:ok, Catalog.deck_unique_card_count(%{deck | deck_cards: deck_cards})}
        end)
    end
  end

  def deck_unique_card_count(%Deck{} = deck, _args, _resolution) do
    {:ok, Catalog.deck_unique_card_count(deck)}
  end

  def deck_cover_image_url(%Deck{} = deck, _args, _resolution) do
    {:ok, Catalog.deck_cover_image_url(deck)}
  end

  def deck_cover_deck_card_id(%Deck{cover_deck_card_id: nil}, _args, _resolution), do: {:ok, nil}

  def deck_cover_deck_card_id(%Deck{cover_deck_card_id: id}, _args, resolution) do
    {:ok, Node.to_global_id(:deck_card, id, resolution.schema)}
  end

  def deck_commander_color_identity(%Deck{} = deck, _args, _resolution) do
    {:ok, Catalog.deck_commander_color_identity(deck)}
  end

  def deck_ai_analyzed_at(%Deck{ai_analyzed_at: nil}, _args, _resolution), do: {:ok, nil}

  def deck_ai_analyzed_at(%Deck{ai_analyzed_at: analyzed_at}, _args, _resolution) do
    {:ok, DateTime.to_iso8601(analyzed_at)}
  end

  def deck_question_answer_inserted_at(%{inserted_at: inserted_at}, _args, _resolution) do
    {:ok, DateTime.to_iso8601(inserted_at)}
  end

  def deck_question_answer_recommended_cuts(question_answer, _args, _resolution) do
    {:ok, recommendation_names(question_answer, :cuts)}
  end

  def deck_question_answer_recommended_additions(question_answer, _args, _resolution) do
    {:ok, recommendation_names(question_answer, :additions)}
  end

  def deck_legality(%Deck{deck_cards: deck_cards} = deck, _args, _resolution)
      when is_list(deck_cards) do
    {:ok, Catalog.deck_legality(deck)}
  end

  def deck_legality(%Deck{} = deck, _args, %{context: %{loader: loader}}) do
    case Catalog.fetch_cached_deck_cards(deck) do
      {:ok, deck_cards} ->
        {:ok, Catalog.deck_legality(%{deck | deck_cards: deck_cards})}

      _miss ->
        loader
        |> Dataloader.load(Catalog, :deck_cards, deck)
        |> on_load(fn loader ->
          deck_cards = Dataloader.get(loader, Catalog, :deck_cards, deck)
          {:ok, Catalog.deck_legality(%{deck | deck_cards: deck_cards})}
        end)
    end
  end

  def deck_legality(%Deck{} = deck, _args, _resolution) do
    {:ok, Catalog.deck_legality(deck)}
  end

  defp recommendation_names(%{recommendations: recommendations}, key)
       when is_map(recommendations) do
    case Map.get(recommendations, key) || Map.get(recommendations, Atom.to_string(key)) do
      names when is_list(names) -> Enum.filter(names, &is_binary/1)
      _other -> []
    end
  end

  defp recommendation_names(_question_answer, _key), do: []

  def deck_card_allocation_status(%DeckCard{allocation_status: status}, _args, _resolution)
      when is_map(status) do
    {:ok, %{status | state: to_string(status.state)}}
  end

  def deck_card_allocation_status(%DeckCard{} = deck_card, _args, _resolution) do
    status = Catalog.deck_card_allocation_status(deck_card)
    {:ok, %{status | state: to_string(status.state)}}
  end

  def deck_tags(%Deck{} = deck, _args, _resolution) do
    {:ok, Catalog.list_deck_tags(deck)}
  end

  def deck_card_tag_ids(%DeckCard{tag_ids: tag_ids}, _args, _resolution)
      when is_list(tag_ids) do
    {:ok, tag_ids}
  end

  def deck_card_tag_ids(%DeckCard{} = deck_card, _args, _resolution) do
    [updated] = Catalog.put_deck_card_tag_ids([deck_card])
    {:ok, updated.tag_ids}
  end
end
