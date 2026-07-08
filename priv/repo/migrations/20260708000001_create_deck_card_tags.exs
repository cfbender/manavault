defmodule Manavault.Repo.Migrations.CreateDeckCardTags do
  use Ecto.Migration

  def change do
    create table(:deck_card_tags) do
      add :deck_card_id, references(:deck_cards, on_delete: :delete_all), null: false
      add :deck_tag_id, references(:deck_tags, on_delete: :delete_all), null: false
      add :deck_id, references(:decks, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime)
    end

    create index(:deck_card_tags, [:deck_tag_id])
    create unique_index(:deck_card_tags, [:deck_card_id, :deck_tag_id])
  end
end
