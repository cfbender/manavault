defmodule Manavault.Repo.Migrations.DeleteCardsWithoutPrintings do
  use Ecto.Migration

  import Ecto.Query

  @batch_size 200

  def up do
    orphaned_card_ids =
      repo().all(
        from(card in "scryfall_cards",
          left_join: printing in "scryfall_printings",
          on: printing.oracle_id == card.oracle_id,
          where: is_nil(printing.scryfall_id),
          select: card.oracle_id
        )
      )

    Enum.each(Enum.chunk_every(orphaned_card_ids, @batch_size), fn ids ->
      repo().delete_all(from(deck_card in "deck_cards", where: deck_card.oracle_id in ^ids))
      repo().delete_all(from(card in "scryfall_cards", where: card.oracle_id in ^ids))
    end)
  end

  def down do
    # Deleted catalog and deck-card rows cannot be reconstructed.
    :ok
  end
end
