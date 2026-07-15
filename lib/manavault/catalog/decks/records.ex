defmodule Manavault.Catalog.Decks.Records do
  @moduledoc false

  alias Manavault.Catalog.Deck
  alias Manavault.Catalog.Decks.{Cards, DefaultTags, Preloads, Queries, ShareToken}
  alias Manavault.Repo

  @reserving_deck_statuses ["active"]
  @share_token_attempts 5

  def change_deck(%Deck{} = deck, attrs \\ %{}) do
    Deck.changeset(deck, attrs)
  end

  def create_deck(attrs) when is_map(attrs) do
    Repo.transact(fn ->
      case %Deck{} |> Deck.changeset(attrs) |> Repo.insert() do
        {:ok, deck} ->
          case DefaultTags.seed_deck_default_tags(deck) do
            {:ok, _deck_tags} -> {:ok, deck}
            {:error, reason} -> Repo.rollback(reason)
          end

        {:error, changeset} ->
          Repo.rollback(changeset)
      end
    end)
  end

  def update_deck(%Deck{} = deck, attrs) when is_map(attrs) do
    deck
    |> Deck.changeset(attrs)
    |> Repo.update()
  end

  def ensure_deck_share_token(%Deck{} = deck) do
    deck = Repo.get!(Deck, deck.id)

    case deck.share_token do
      token when is_binary(token) and token != "" ->
        {:ok, Repo.preload(deck, Preloads.deck_preloads())}

      _token ->
        put_deck_share_token(deck, @share_token_attempts)
    end
  end

  def delete_deck(%Deck{} = deck) do
    Repo.transact(fn ->
      deck =
        deck
        |> Repo.preload(deck_cards: [deck_allocations: [:collection_item]])

      Enum.each(deck.deck_cards, fn deck_card ->
        case Cards.delete_deck_card(deck_card) do
          {:ok, _deck_card} -> :ok
          {:error, reason} -> Repo.rollback(reason)
        end
      end)

      case Repo.delete(deck) do
        {:ok, deck} -> {:ok, deck}
        {:error, changeset} -> {:error, changeset}
      end
    end)
  end

  def deck_reserves_cards?(%Deck{status: status}), do: deck_reserves_cards?(status)
  def deck_reserves_cards?(status) when is_binary(status), do: status in @reserving_deck_statuses

  defp put_deck_share_token(_deck, 0), do: {:error, :share_token_collision}

  defp put_deck_share_token(%Deck{} = deck, attempts) do
    case deck |> Deck.share_changeset(new_share_token()) |> Repo.update() do
      {:ok, deck} ->
        {:ok, Repo.preload(deck, Preloads.deck_preloads())}

      {:error, changeset} ->
        if Keyword.has_key?(changeset.errors, :share_token) do
          deck
          |> Map.fetch!(:id)
          |> Queries.get_deck!()
          |> put_deck_share_token(attempts - 1)
        else
          {:error, changeset}
        end
    end
  end

  defp new_share_token, do: ShareToken.generate()
end
