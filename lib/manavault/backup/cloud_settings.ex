defmodule Manavault.Backup.CloudSettings do
  use Ecto.Schema

  import Ecto.Changeset

  @primary_key {:id, :integer, autogenerate: false}
  schema "backup_settings" do
    field :enabled, :boolean, default: false
    field :provider, :string, default: "none"
    field :cron, :string, default: "0 3 * * *"

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

    field :last_backup_at, :utc_datetime
    field :last_backup_status, :string
    field :last_backup_message, :string
    field :last_backup_path, :string

    field :last_restore_at, :utc_datetime
    field :last_restore_status, :string
    field :last_restore_message, :string
    field :pending_restore_path, :string

    timestamps(type: :utc_datetime)
  end

  @providers ~w(none s3 google_drive)
  @fields [
    :enabled,
    :provider,
    :cron,
    :s3_endpoint,
    :s3_bucket,
    :s3_region,
    :s3_prefix,
    :s3_access_key_id,
    :s3_secret_access_key,
    :google_client_id,
    :google_client_secret,
    :google_refresh_token,
    :google_folder_id,
    :last_backup_at,
    :last_backup_status,
    :last_backup_message,
    :last_backup_path,
    :last_restore_at,
    :last_restore_status,
    :last_restore_message,
    :pending_restore_path
  ]

  def changeset(settings, attrs) do
    settings
    |> cast(attrs, @fields)
    |> normalize_blanks()
    |> validate_required([:provider, :cron])
    |> validate_inclusion(:provider, @providers)
    |> validate_change(:cron, &validate_cron/2)
    |> validate_provider_config()
  end

  def status_changeset(settings, attrs) do
    settings
    |> cast(attrs, [
      :last_backup_at,
      :last_backup_status,
      :last_backup_message,
      :last_backup_path,
      :last_restore_at,
      :last_restore_status,
      :last_restore_message,
      :pending_restore_path
    ])
  end

  def secret_present?(%__MODULE__{} = settings, field) do
    settings
    |> Map.get(field)
    |> present?()
  end

  defp normalize_blanks(changeset) do
    Enum.reduce(@fields, changeset, fn field, changeset ->
      case get_change(changeset, field) do
        value when is_binary(value) -> put_change(changeset, field, blank_to_nil(value))
        _value -> changeset
      end
    end)
  end

  defp blank_to_nil(value) do
    value = String.trim(value)
    if value == "", do: nil, else: value
  end

  defp validate_cron(:cron, value) do
    case Manavault.Backup.Cron.parse(value) do
      {:ok, _} -> []
      {:error, reason} -> [cron: reason]
    end
  end

  defp validate_provider_config(changeset) do
    case get_field(changeset, :provider) do
      "none" ->
        changeset

      "s3" ->
        validate_required(changeset, [
          :s3_endpoint,
          :s3_bucket,
          :s3_region,
          :s3_access_key_id,
          :s3_secret_access_key
        ])

      "google_drive" ->
        validate_required(changeset, [
          :google_client_id,
          :google_client_secret,
          :google_refresh_token
        ])
    end
  end

  defp present?(value), do: is_binary(value) and String.trim(value) != ""
end
