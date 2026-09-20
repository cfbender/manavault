defmodule Manavault.Backup do
  @moduledoc "Creates and restores portable ManaVault data backups."

  alias Manavault.Backup.{Cloud, Create, Restore, Settings}

  def settings, do: Settings.get!()
  def update_settings(attrs), do: Settings.update(attrs)
  def run_cloud_backup(opts \\ []), do: Cloud.run_backup(opts)
  def list_cloud_backups, do: Cloud.list_backups()
  def stage_cloud_restore(remote_id), do: Cloud.stage_restore(remote_id)

  defdelegate create!(opts \\ []), to: Create, as: :run!
  defdelegate restore!(artifact_path, opts \\ []), to: Restore, as: :run!

  def database_path!(repo \\ Manavault.Repo, opts \\ []) do
    Keyword.get(opts, :database_path) ||
      repo.config()
      |> Keyword.fetch!(:database)
      |> Path.expand()
  end

  def data_dir(database_path, opts \\ []) do
    Keyword.get(opts, :data_dir) ||
      System.get_env("DATA_DIR") ||
      database_path |> Path.dirname() |> Path.expand()
  end
end
