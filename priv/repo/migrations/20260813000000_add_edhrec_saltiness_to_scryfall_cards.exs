defmodule Manavault.Repo.Migrations.AddEdhrecSaltinessToScryfallCards do
  use Ecto.Migration

  def change do
    alter table(:scryfall_cards) do
      add :edhrec_saltiness, :float
    end
  end
end
