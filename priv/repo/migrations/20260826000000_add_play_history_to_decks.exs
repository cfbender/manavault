defmodule Manavault.Repo.Migrations.AddPlayHistoryToDecks do
  use Ecto.Migration

  def change do
    alter table(:decks) do
      add :play_count, :integer, null: false, default: 0
      add :skip_count, :integer, null: false, default: 0
      add :last_played_at, :utc_datetime
    end
  end
end
