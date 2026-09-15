defmodule Manavault.Repo.Migrations.AddCoverDeckCardToDecks do
  use Ecto.Migration

  def change do
    alter table(:decks) do
      add :cover_deck_card_id, references(:deck_cards, on_delete: :nilify_all)
    end

    create index(:decks, [:cover_deck_card_id])
  end
end
