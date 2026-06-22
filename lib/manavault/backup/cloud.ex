defmodule Manavault.Backup.Cloud do
  @moduledoc false

  alias Manavault.Backup.{GoogleDriveClient, S3Client, Settings}

  require Logger

  def run_backup(opts \\ []) do
    settings = Keyword.get(opts, :settings, Settings.get!())

    with :ok <- ensure_provider(settings),
         :ok <- validate_target(settings),
         artifact_path <- Manavault.Backup.create!(reason: :cloud),
         {:ok, remote} <- upload(settings, artifact_path) do
      Settings.update_status(%{
        last_backup_at: DateTime.utc_now() |> DateTime.truncate(:second),
        last_backup_status: "ok",
        last_backup_message: "Uploaded #{remote.name}",
        last_backup_path: remote.id
      })

      {:ok, remote}
    else
      {:error, reason} = error ->
        Settings.update_status(%{
          last_backup_at: DateTime.utc_now() |> DateTime.truncate(:second),
          last_backup_status: "error",
          last_backup_message: error_message(reason)
        })

        error
    end
  rescue
    exception ->
      message = Exception.message(exception)

      Settings.update_status(%{
        last_backup_at: DateTime.utc_now() |> DateTime.truncate(:second),
        last_backup_status: "error",
        last_backup_message: message
      })

      {:error, message}
  end

  def list_backups(settings \\ Settings.get!())
  def list_backups(%{provider: "none"}), do: {:ok, []}

  def list_backups(settings) do
    with :ok <- ensure_provider(settings) do
      list(settings)
    end
  end

  def stage_restore(remote_id, opts \\ []) do
    settings = Keyword.get(opts, :settings, Settings.get!())

    with :ok <- ensure_provider(settings),
         {:ok, destination} <- pending_restore_path(),
         :ok <- download(settings, remote_id, destination) do
      Settings.update_status(%{
        last_restore_at: DateTime.utc_now() |> DateTime.truncate(:second),
        last_restore_status: "pending_restart",
        last_restore_message: "Restore is staged. Restart ManaVault to apply it.",
        pending_restore_path: destination
      })

      {:ok,
       %{
         status: "pending_restart",
         message: "Restore is staged. Restart ManaVault to apply it.",
         path: destination
       }}
    else
      {:error, reason} = error ->
        Settings.update_status(%{
          last_restore_at: DateTime.utc_now() |> DateTime.truncate(:second),
          last_restore_status: "error",
          last_restore_message: error_message(reason)
        })

        error
    end
  rescue
    exception ->
      message = Exception.message(exception)

      Settings.update_status(%{
        last_restore_at: DateTime.utc_now() |> DateTime.truncate(:second),
        last_restore_status: "error",
        last_restore_message: message
      })

      {:error, message}
  end

  def apply_pending_restore(opts \\ []) do
    database_path = Manavault.Backup.database_path!(Manavault.Repo, opts)
    data_dir = Manavault.Backup.data_dir(database_path, opts)
    restore_dir = Path.join(data_dir, "restores")
    pending_path = Path.join(restore_dir, "pending.zip")

    if File.exists?(pending_path) do
      applied_path = Path.join(restore_dir, "applied-#{timestamp()}.zip")
      Manavault.Backup.restore!(pending_path, opts)
      File.rename!(pending_path, applied_path)

      File.write!(
        Path.join(restore_dir, "last-restore.json"),
        Jason.encode!(%{
          status: "ok",
          applied_at: DateTime.utc_now() |> DateTime.to_iso8601(),
          artifact_path: applied_path
        })
      )

      Logger.info("applied pending cloud restore from #{applied_path}")
      {:ok, applied_path}
    else
      :ok
    end
  rescue
    exception ->
      database_path = Manavault.Backup.database_path!(Manavault.Repo, opts)
      data_dir = Manavault.Backup.data_dir(database_path, opts)
      restore_dir = Path.join(data_dir, "restores")
      File.mkdir_p!(restore_dir)

      File.write!(
        Path.join(restore_dir, "last-restore.json"),
        Jason.encode!(%{
          status: "error",
          failed_at: DateTime.utc_now() |> DateTime.to_iso8601(),
          message: Exception.message(exception)
        })
      )

      reraise exception, __STACKTRACE__
  end

  defp validate_target(%{provider: "s3"} = settings) do
    case S3Client.list(settings) do
      {:ok, _backups} -> :ok
      {:error, _reason} = error -> error
    end
  end

  defp validate_target(_settings), do: :ok

  defp upload(%{provider: "s3"} = settings, artifact_path),
    do: S3Client.upload(settings, artifact_path)

  defp upload(%{provider: "google_drive"} = settings, artifact_path),
    do: GoogleDriveClient.upload(settings, artifact_path)

  defp list(%{provider: "s3"} = settings), do: S3Client.list(settings)
  defp list(%{provider: "google_drive"} = settings), do: GoogleDriveClient.list(settings)

  defp download(%{provider: "s3"} = settings, remote_id, destination),
    do: S3Client.download(settings, remote_id, destination)

  defp download(%{provider: "google_drive"} = settings, remote_id, destination),
    do: GoogleDriveClient.download(settings, remote_id, destination)

  defp ensure_provider(%{provider: provider}) when provider in ["s3", "google_drive"], do: :ok

  defp ensure_provider(_settings),
    do: {:error, "Choose Google Drive or S3 before running cloud backups."}

  defp pending_restore_path do
    database_path = Manavault.Backup.database_path!(Manavault.Repo)
    restore_dir = database_path |> Manavault.Backup.data_dir() |> Path.join("restores")
    File.mkdir_p(restore_dir)
    {:ok, Path.join(restore_dir, "pending.zip")}
  end

  defp error_message(reason) when is_binary(reason), do: reason
  defp error_message(reason), do: inspect(reason)

  defp timestamp do
    DateTime.utc_now()
    |> Calendar.strftime("%Y%m%dT%H%M%SZ")
  end
end
