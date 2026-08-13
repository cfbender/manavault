defmodule Manavault.Repo.Migrations.AddEdhrecCommanderRankToScryfallCards do
  use Ecto.Migration

  def change do
    alter table(:scryfall_cards) do
      add :edhrec_commander_rank, :integer
    end
  end
end
