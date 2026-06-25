defmodule Manavault.Catalog.Decks.Cards do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, Deck, DeckCard, Decklists, Printing, Util}
  alias Manavault.Catalog.Decks.{AllocationItems, Printings}
  alias Manavault.Repo

  def change_deck_card(%DeckCard{} = deck_card, attrs \\ %{}) do
    DeckCard.changeset(deck_card, attrs)
  end

  def add_card_to_deck(%Deck{} = deck, attrs) when is_map(attrs) do
    attrs =
      attrs
      |> stringify_keys()
      |> Map.put_new("deck_id", deck.id)
      |> normalize_blank_preferred_printing()
      |> normalize_blank_deck_card_tag()

    with {:ok, attrs} <- resolve_deck_card_identity(attrs),
         {:ok, attrs} <- validate_preferred_printing_identity(attrs) do
      upsert_deck_card(attrs)
    end
  end

  def update_deck_card(%DeckCard{} = deck_card, attrs) when is_map(attrs) do
    attrs =
      attrs
      |> stringify_keys()
      |> normalize_blank_preferred_printing()
      |> normalize_blank_deck_card_tag()

    attrs =
      attrs
      |> Map.put_new("deck_id", deck_card.deck_id)
      |> Map.put_new("oracle_id", deck_card.oracle_id)

    with {:ok, attrs} <- validate_preferred_printing_identity(attrs) do
      deck_card
      |> DeckCard.changeset(attrs)
      |> Repo.update()
    end
  end

  def update_deck_cards_tag(deck_card_ids, tag) when is_list(deck_card_ids) do
    normalized_tag = normalize_deck_card_tag(tag)

    Repo.transact(fn ->
      deck_cards =
        deck_card_ids
        |> Enum.uniq()
        |> Enum.map(fn deck_card_id ->
          deck_card = Repo.get!(DeckCard, deck_card_id)

          case update_deck_card(deck_card, %{"tag" => normalized_tag}) do
            {:ok, deck_card} -> deck_card
            {:error, reason} -> Repo.rollback(reason)
          end
        end)

      {:ok, deck_cards}
    end)
  end

  def optimize_deck_card_printings(deck_card_ids) when is_list(deck_card_ids) do
    deck_card_ids = Enum.uniq(deck_card_ids)

    Repo.transact(fn ->
      deck_cards =
        DeckCard
        |> where([deck_card], deck_card.id in ^deck_card_ids)
        |> Repo.all()
        |> Repo.preload([:deck_allocations, card: :printings])
        |> Map.new(&{&1.id, &1})

      optimized =
        Enum.reduce(deck_card_ids, [], fn deck_card_id, acc ->
          deck_card = Map.fetch!(deck_cards, deck_card_id)

          case Printings.cheapest_priced_printing(deck_card) do
            %Printing{scryfall_id: scryfall_id}
            when scryfall_id != deck_card.preferred_printing_id ->
              clear_deck_card_allocations!(deck_card)

              case update_deck_card(deck_card, %{"preferred_printing_id" => scryfall_id}) do
                {:ok, deck_card} -> [deck_card | acc]
                {:error, reason} -> Repo.rollback(reason)
              end

            _no_change ->
              acc
          end
        end)

      {:ok, Enum.reverse(optimized)}
    end)
  end

  def set_deck_commander(%DeckCard{} = deck_card) do
    Repo.transact(fn ->
      deck_card = Repo.preload(deck_card, [:card, :preferred_printing])

      unless legendary_creature?(deck_card) do
        Repo.rollback(:not_legendary_creature)
      end

      DeckCard
      |> where(
        [card],
        card.deck_id == ^deck_card.deck_id and card.zone == "commander" and
          card.id != ^deck_card.id
      )
      |> Repo.all()
      |> Enum.each(&move_deck_card_to_zone!(&1, "mainboard"))

      deck_card =
        deck_card
        |> move_deck_card_to_zone!("commander")
        |> Repo.preload([:card, :preferred_printing])

      {:ok, deck_card}
    end)
  end

  def delete_deck_card(%DeckCard{} = deck_card) do
    Repo.transact(fn ->
      deck_card =
        Repo.preload(deck_card, deck_allocations: [:collection_item])

      clear_deck_card_allocations!(deck_card)

      case Repo.delete(deck_card) do
        {:ok, deck_card} -> {:ok, deck_card}
        {:error, changeset} -> {:error, changeset}
      end
    end)
  end

  defp clear_deck_card_allocations!(%DeckCard{} = deck_card) do
    deck_card
    |> Repo.preload([deck_allocations: [:collection_item]], force: true)
    |> Map.get(:deck_allocations)
    |> Enum.each(fn allocation ->
      AllocationItems.restore_from_deck!(
        allocation.collection_item,
        allocation.quantity,
        allocation.source_location_id
      )

      case Repo.delete(allocation) do
        {:ok, _allocation} -> :ok
        {:error, changeset} -> Repo.rollback(changeset)
      end
    end)
  end

  defp stringify_keys(attrs) do
    Map.new(attrs, fn {key, value} -> {to_string(key), value} end)
  end

  defp normalize_blank_preferred_printing(%{"preferred_printing_id" => ""} = attrs),
    do: Map.put(attrs, "preferred_printing_id", nil)

  defp normalize_blank_preferred_printing(attrs), do: attrs

  defp normalize_blank_deck_card_tag(%{"tag" => tag} = attrs),
    do: Map.put(attrs, "tag", normalize_deck_card_tag(tag))

  defp normalize_blank_deck_card_tag(attrs), do: attrs

  defp normalize_deck_card_tag(tag) when tag in ["", nil], do: nil
  defp normalize_deck_card_tag(tag), do: tag

  defp resolve_deck_card_identity(%{"oracle_id" => oracle_id} = attrs)
       when is_binary(oracle_id) and oracle_id != "" do
    if Repo.get(Card, oracle_id), do: {:ok, attrs}, else: {:error, :card_not_found}
  end

  defp resolve_deck_card_identity(%{"name" => name} = attrs) when is_binary(name) do
    case find_card_by_name(name) do
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

  defp find_card_by_name(name) do
    normalized_name = Decklists.normalize_card_name(name)

    Repo.one(
      from card in Card,
        where: fragment("lower(?) = ?", card.name, ^String.downcase(normalized_name)),
        order_by: [asc: card.name],
        limit: 1
    )
  end

  defp move_deck_card_to_zone!(%DeckCard{} = deck_card, zone) do
    existing =
      DeckCard
      |> where(
        [card],
        card.deck_id == ^deck_card.deck_id and card.oracle_id == ^deck_card.oracle_id and
          card.zone == ^zone and card.id != ^deck_card.id
      )
      |> Repo.one()

    case existing do
      %DeckCard{} = existing ->
        merged =
          existing
          |> DeckCard.changeset(%{"quantity" => existing.quantity + deck_card.quantity})
          |> Repo.update!()

        Repo.delete!(deck_card)
        merged

      nil ->
        deck_card
        |> DeckCard.changeset(%{"zone" => zone})
        |> Repo.update!()
    end
  end

  defp legendary_creature?(%DeckCard{card: %Card{type_line: type_line}})
       when is_binary(type_line) do
    String.contains?(type_line, "Legendary") and String.contains?(type_line, "Creature")
  end

  defp legendary_creature?(_deck_card), do: false
end
