defmodule Manavault.Catalog.Decks.AddDeckPartner do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{CommanderRules, DeckCard}
  alias Manavault.Catalog.Decks.{EditGuard, SetDeckCommander}
  alias Manavault.Repo

  def run(%DeckCard{} = deck_card) do
    with :ok <- EditGuard.ensure_deck_card_editable(deck_card) do
      Repo.transact(fn ->
        deck_card = Repo.preload(deck_card, [:card, :preferred_printing])

        if deck_card.zone == "commander", do: Repo.rollback(:already_commander)

        commanders =
          DeckCard
          |> where(
            [card],
            card.deck_id == ^deck_card.deck_id and card.zone == "commander" and
              card.id != ^deck_card.id
          )
          |> Repo.all()
          |> Repo.preload(:card)

        add_partner(deck_card, commanders)
      end)
    end
  end

  defp add_partner(deck_card, [commander]) do
    unless CommanderRules.valid_pair?(deck_card.card, commander.card) do
      Repo.rollback(:invalid_commander_pair)
    end

    deck_card =
      deck_card
      |> SetDeckCommander.move_to_zone!("commander")
      |> Repo.preload([:card, :preferred_printing])

    {:ok, deck_card}
  end

  defp add_partner(_deck_card, []), do: Repo.rollback(:no_commander)
  defp add_partner(_deck_card, _multiple), do: Repo.rollback(:command_zone_full)
end
