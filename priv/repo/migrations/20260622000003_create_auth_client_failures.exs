defmodule Manavault.Repo.Migrations.CreateAuthClientFailures do
  use Ecto.Migration

  def change do
    create table(:auth_client_failures) do
      add :client_id, :text, null: false
      add :failed_attempts, :integer, null: false, default: 0
      add :banned_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create unique_index(:auth_client_failures, [:client_id])
    create index(:auth_client_failures, [:banned_at])
  end
end
