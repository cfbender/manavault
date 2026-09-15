defmodule Manavault.Repo.Migrations.CreateVendorPrices do
  use Ecto.Migration

  def change do
    create table(:vendor_prices, primary_key: false) do
      add :vendor, :string, primary_key: true
      add :scryfall_id, :string, primary_key: true
      add :finish, :string, primary_key: true
      add :price_cents, :integer, null: false

      timestamps(type: :utc_datetime_usec)
    end

    create index(:vendor_prices, [:scryfall_id])
    create index(:vendor_prices, [:vendor, :updated_at])

    create table(:pricing_settings, primary_key: false) do
      add :id, :integer, primary_key: true
      add :source, :string, null: false, default: "scryfall"

      timestamps(type: :utc_datetime)
    end
  end
end
