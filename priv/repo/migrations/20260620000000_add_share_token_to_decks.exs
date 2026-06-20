defmodule Manavault.Repo.Migrations.AddShareTokenToDecks do
  use Ecto.Migration

  def change do
    alter table(:decks) do
      add :share_token, :string
    end

    create unique_index(:decks, [:share_token])
  end
end
