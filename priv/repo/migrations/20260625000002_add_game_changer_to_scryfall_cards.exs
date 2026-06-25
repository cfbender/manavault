defmodule Manavault.Repo.Migrations.AddGameChangerToScryfallCards do
  use Ecto.Migration

  def change do
    alter table(:scryfall_cards) do
      add :game_changer, :boolean, null: false, default: false
    end
  end
end
