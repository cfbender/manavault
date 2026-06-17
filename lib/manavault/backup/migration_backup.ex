defmodule Manavault.Backup.MigrationBackup do
  @moduledoc false

  require Logger

  def child_spec(opts) do
    %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [opts]},
      type: :worker
    }
  end

  def start_link(opts) do
    repo = Keyword.fetch!(opts, :repo)

    if backup_before_migrations?(repo) do
      path = Manavault.Backup.create!(repo: repo, reason: :pre_migration)
      Logger.info("created pre-migration backup at #{path}")
    end

    :ignore
  end

  defp backup_before_migrations?(repo) do
    System.get_env("RELEASE_NAME") != nil and
      System.get_env("MANAVAULT_SKIP_MIGRATION_BACKUP") not in ["1", "true", "TRUE"] and
      File.exists?(Manavault.Backup.database_path!(repo)) and
      pending_migrations?(repo)
  end

  defp pending_migrations?(repo) do
    repo
    |> Ecto.Migrator.migrations()
    |> Enum.any?(fn
      {:down, _version, _name} -> true
      _migration -> false
    end)
  end
end
