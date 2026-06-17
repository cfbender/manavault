defmodule Manavault.Repo.Migrations.AddGroupingFieldsToCatalog do
  use Ecto.Migration

  def change do
    alter table(:scryfall_cards) do
      add :mana_cost, :text
      add :cmc, :float
      add :colors, :text, null: false, default: "[]"
    end

    alter table(:scryfall_printings) do
      add :rarity, :string
    end
  end
end
