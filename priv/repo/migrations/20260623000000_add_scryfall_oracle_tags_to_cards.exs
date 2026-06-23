defmodule Manavault.Repo.Migrations.AddScryfallOracleTagsToCards do
  use Ecto.Migration

  def change do
    alter table(:scryfall_cards) do
      add :oracle_tags, :text, null: false, default: "[]"
      add :deck_category, :string
      add :deck_themes, :text, null: false, default: "[]"
    end

    create index(:scryfall_cards, [:deck_category])
  end
end
