defmodule Manavault.Repo.Migrations.AddPromoTypesToScryfallPrintings do
  use Ecto.Migration

  def change do
    alter table(:scryfall_printings) do
      add :promo_types, :text, null: false, default: "[]"
    end
  end
end
