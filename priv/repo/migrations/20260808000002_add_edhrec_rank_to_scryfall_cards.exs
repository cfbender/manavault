defmodule Manavault.Repo.Migrations.AddEdhrecRankToScryfallCards do
  use Ecto.Migration

  def change do
    alter table(:scryfall_cards) do
      add :edhrec_rank, :integer
    end
  end
end
