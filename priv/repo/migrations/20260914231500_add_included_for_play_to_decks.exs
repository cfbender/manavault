defmodule Manavault.Repo.Migrations.AddIncludedForPlayToDecks do
  use Ecto.Migration

  def change do
    alter table(:decks) do
      add :included_for_play, :boolean, null: false, default: true
    end
  end
end
