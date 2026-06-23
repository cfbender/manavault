defmodule Manavault.Repo.Migrations.AddRulingsUriToScryfallCards do
  use Ecto.Migration

  def change do
    alter table(:scryfall_cards) do
      add :rulings_uri, :text
    end
  end
end
