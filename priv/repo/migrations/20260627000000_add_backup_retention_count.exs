defmodule Manavault.Repo.Migrations.AddBackupRetentionCount do
  use Ecto.Migration

  def change do
    alter table(:backup_settings) do
      add :retention_count, :integer
    end
  end
end
