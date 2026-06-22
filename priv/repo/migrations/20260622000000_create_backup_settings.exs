defmodule Manavault.Repo.Migrations.CreateBackupSettings do
  use Ecto.Migration

  def change do
    create table(:backup_settings, primary_key: false) do
      add :id, :integer, primary_key: true
      add :enabled, :boolean, null: false, default: false
      add :provider, :text, null: false, default: "none"
      add :cron, :text, null: false, default: "0 3 * * *"

      add :s3_endpoint, :text
      add :s3_bucket, :text
      add :s3_region, :text
      add :s3_prefix, :text
      add :s3_access_key_id, :text
      add :s3_secret_access_key, :text

      add :google_client_id, :text
      add :google_client_secret, :text
      add :google_refresh_token, :text
      add :google_folder_id, :text

      add :last_backup_at, :utc_datetime
      add :last_backup_status, :text
      add :last_backup_message, :text
      add :last_backup_path, :text

      add :last_restore_at, :utc_datetime
      add :last_restore_status, :text
      add :last_restore_message, :text
      add :pending_restore_path, :text

      timestamps(type: :utc_datetime)
    end
  end
end
