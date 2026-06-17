defmodule Manavault.Repo.Migrations.AddFinishToDeckCards do
  use Ecto.Migration

  def change do
    alter table(:deck_cards) do
      add :finish, :string, null: false, default: "nonfoil"
    end
  end
end
