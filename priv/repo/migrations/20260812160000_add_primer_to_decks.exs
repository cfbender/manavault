defmodule Manavault.Repo.Migrations.AddPrimerToDecks do
  use Ecto.Migration

  def change do
    alter table(:decks) do
      add :primer, :text
    end
  end
end
