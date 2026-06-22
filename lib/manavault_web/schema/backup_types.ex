defmodule ManavaultWeb.Schema.BackupTypes do
  use Absinthe.Schema.Notation

  object :backup_settings do
    field :id, non_null(:integer)
    field :enabled, non_null(:boolean)
    field :provider, non_null(:string)
    field :cron, non_null(:string)

    field :s3_endpoint, :string
    field :s3_bucket, :string
    field :s3_region, :string
    field :s3_prefix, :string
    field :s3_access_key_id, :string
    field :has_s3_secret_access_key, non_null(:boolean)

    field :google_client_id, :string
    field :google_folder_id, :string
    field :has_google_client_secret, non_null(:boolean)
    field :has_google_refresh_token, non_null(:boolean)

    field :last_backup_at, :string
    field :last_backup_status, :string
    field :last_backup_message, :string
    field :last_backup_path, :string

    field :last_restore_at, :string
    field :last_restore_status, :string
    field :last_restore_message, :string
    field :pending_restore_path, :string
  end

  object :cloud_backup do
    field :id, non_null(:id)
    field :name, non_null(:string)
    field :provider, non_null(:string)
    field :size, :integer
    field :modified_at, :string
  end

  object :cloud_backup_result do
    field :id, :id
    field :name, :string
    field :provider, :string
    field :size, :integer
    field :modified_at, :string
    field :status, non_null(:string)
    field :message, non_null(:string)
  end

  object :cloud_restore_result do
    field :status, non_null(:string)
    field :message, non_null(:string)
    field :path, :string
  end

  input_object :backup_settings_input do
    field :enabled, :boolean
    field :provider, :string
    field :cron, :string

    field :s3_endpoint, :string
    field :s3_bucket, :string
    field :s3_region, :string
    field :s3_prefix, :string
    field :s3_access_key_id, :string
    field :s3_secret_access_key, :string

    field :google_client_id, :string
    field :google_client_secret, :string
    field :google_refresh_token, :string
    field :google_folder_id, :string
  end
end
