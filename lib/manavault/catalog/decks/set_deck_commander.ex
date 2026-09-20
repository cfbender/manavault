defmodule Manavault.Catalog.Decks.SetDeckCommander do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, DeckCard}
  alias Manavault.Catalog.Decks.EditGuard
  alias Manavault.Repo

  def run(%DeckCard{} = deck_card) do
    with :ok <- EditGuard.ensure_deck_card_editable(deck_card) do
      Repo.transact(fn ->
        deck_card = Repo.preload(deck_card, [:card, :preferred_printing])

        unless legendary_creature?(deck_card), do: Repo.rollback(:not_legendary_creature)

        DeckCard
        |> where(
          [card],
          card.deck_id == ^deck_card.deck_id and card.zone == "commander" and
            card.id != ^deck_card.id
        )
        |> Repo.all()
        |> Enum.each(&move_to_zone!(&1, "mainboard"))

        deck_card =
          deck_card
          |> move_to_zone!("commander")
          |> Repo.preload([:card, :preferred_printing])

        {:ok, deck_card}
      end)
    end
  end

  def move_to_zone!(%DeckCard{} = deck_card, zone) do
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
        deck_card |> DeckCard.changeset(%{"zone" => zone}) |> Repo.update!()
    end
  end

  defp legendary_creature?(%DeckCard{card: %Card{type_line: type_line}})
       when is_binary(type_line) do
    String.contains?(type_line, "Legendary") and String.contains?(type_line, "Creature")
  end

  defp legendary_creature?(_deck_card), do: false
end
