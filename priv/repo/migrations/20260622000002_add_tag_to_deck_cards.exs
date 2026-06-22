defmodule Manavault.Repo.Migrations.AddTagToDeckCards do
  use Ecto.Migration

  def change do
    alter table(:deck_cards) do
      add :tag, :string
    end

    create index(:deck_cards, [:tag])
  end
end
