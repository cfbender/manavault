defmodule Manavault.Catalog.Decks.AddCardToDeck do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, Deck, DeckCard, Printing, Util}
  alias Manavault.Catalog.Decks.EditGuard
  alias Manavault.Catalog.Search.CardsByName
  alias Manavault.Repo

  def run(%Deck{} = deck, attrs) when is_map(attrs) do
    attrs =
      attrs
      |> stringify_keys()
      |> Map.put_new("deck_id", deck.id)
      |> normalize_blank_preferred_printing()
      |> normalize_blank_deck_card_tag()

    with :ok <- EditGuard.ensure_deck_editable(deck),
         {:ok, attrs} <- resolve_deck_card_identity(attrs),
         {:ok, attrs} <- validate_preferred_printing_identity(attrs) do
      upsert_deck_card(attrs)
    end
  end

  defp resolve_deck_card_identity(%{"oracle_id" => oracle_id} = attrs)
       when is_binary(oracle_id) and oracle_id != "" do
    if Repo.get(Card, oracle_id), do: {:ok, attrs}, else: {:error, :card_not_found}
  end

  defp resolve_deck_card_identity(%{"name" => name} = attrs) when is_binary(name) do
    case CardsByName.find(name) do
      %Card{} = card -> {:ok, Map.put(attrs, "oracle_id", card.oracle_id)}
      nil -> {:error, :card_not_found}
    end
  end

  defp resolve_deck_card_identity(_attrs), do: {:error, :card_not_found}

  defp validate_preferred_printing_identity(
         %{"oracle_id" => oracle_id, "preferred_printing_id" => preferred_printing_id} = attrs
       )
       when is_binary(preferred_printing_id) do
    case Repo.get(Printing, preferred_printing_id) do
      %Printing{oracle_id: ^oracle_id} -> {:ok, attrs}
      %Printing{} -> {:error, :preferred_printing_mismatch}
      nil -> {:error, :preferred_printing_not_found}
    end
  end

  defp validate_preferred_printing_identity(attrs), do: {:ok, attrs}

  defp upsert_deck_card(attrs) do
    deck_id = attrs["deck_id"]
    oracle_id = attrs["oracle_id"]
    zone = Map.get(attrs, "zone", "mainboard")
    quantity = Util.parse_quantity(Map.get(attrs, "quantity", 1))

    existing =
      Repo.one(
        from deck_card in DeckCard,
          where:
            deck_card.deck_id == ^deck_id and deck_card.oracle_id == ^oracle_id and
              deck_card.zone == ^zone,
          limit: 1
      )

    attrs = Map.put(attrs, "quantity", quantity)

    case existing do
      nil ->
        %DeckCard{}
        |> DeckCard.changeset(attrs)
        |> Repo.insert()

      %DeckCard{} = deck_card ->
        update_attrs =
          attrs
          |> Map.put("quantity", deck_card.quantity + quantity)
          |> Map.take(["quantity", "preferred_printing_id", "zone", "finish", "tag"])
          |> Enum.reject(fn {key, value} ->
            key == "preferred_printing_id" and is_nil(value)
          end)
          |> Map.new()

        deck_card
        |> DeckCard.changeset(update_attrs)
        |> Repo.update()
    end
  end

  defp stringify_keys(attrs), do: Map.new(attrs, fn {key, value} -> {to_string(key), value} end)

  defp normalize_blank_preferred_printing(%{"preferred_printing_id" => ""} = attrs),
    do: Map.put(attrs, "preferred_printing_id", nil)

  defp normalize_blank_preferred_printing(attrs), do: attrs

  defp normalize_blank_deck_card_tag(%{"tag" => tag} = attrs),
    do: Map.put(attrs, "tag", normalize_deck_card_tag(tag))

  defp normalize_blank_deck_card_tag(attrs), do: attrs
  defp normalize_deck_card_tag(tag) when tag in ["", nil], do: nil
  defp normalize_deck_card_tag(tag), do: tag
end
