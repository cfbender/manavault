defmodule Manavault.Backup.Settings do
  @moduledoc false

  alias Manavault.Backup.CloudSettings
  alias Manavault.Repo

  @singleton_id 1

  def get! do
    Repo.get(CloudSettings, @singleton_id) || insert_default!()
  end

  def update(attrs) do
    settings = get!()

    settings
    |> CloudSettings.changeset(merge_secret_attrs(attrs, settings))
    |> Repo.update()
  end

  def update_status(attrs) do
    get!()
    |> CloudSettings.status_changeset(attrs)
    |> Repo.update!()
  end

  def sanitize(%CloudSettings{} = settings) do
    settings
    |> Map.from_struct()
    |> Map.drop([:__meta__, :s3_secret_access_key, :google_client_secret, :google_refresh_token])
    |> Map.merge(%{
      has_s3_secret_access_key: CloudSettings.secret_present?(settings, :s3_secret_access_key),
      has_google_client_secret: CloudSettings.secret_present?(settings, :google_client_secret),
      has_google_refresh_token: CloudSettings.secret_present?(settings, :google_refresh_token)
    })
  end

  defp insert_default! do
    %CloudSettings{id: @singleton_id}
    |> CloudSettings.changeset(%{})
    |> Repo.insert!(on_conflict: :nothing)

    Repo.get!(CloudSettings, @singleton_id)
  end

  defp merge_secret_attrs(attrs, settings) do
    attrs = Enum.into(attrs, %{})

    attrs
    |> preserve_secret(:s3_secret_access_key, settings)
    |> preserve_secret(:google_client_secret, settings)
    |> preserve_secret(:google_refresh_token, settings)
  end

  defp preserve_secret(attrs, key, settings) do
    case Map.fetch(attrs, key) do
      :error ->
        attrs

      {:ok, nil} ->
        Map.put(attrs, key, Map.get(settings, key))

      {:ok, value} when is_binary(value) ->
        if String.trim(value) == "", do: Map.put(attrs, key, Map.get(settings, key)), else: attrs

      {:ok, _value} ->
        attrs
    end
  end
end
