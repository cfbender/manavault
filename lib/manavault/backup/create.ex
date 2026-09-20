defmodule Manavault.Backup.Create do
  @moduledoc false

  alias Manavault.Backup
  alias Manavault.Backup.{Archive, Snapshot}

  @app :manavault
  @db_name "manavault.db"
  @manifest_name "manifest.json"
  @default_local_paths []

  def run!(opts \\ []) do
    repo = Keyword.get(opts, :repo, Manavault.Repo)
    database_path = Backup.database_path!(repo, opts)
    data_dir = Backup.data_dir(database_path, opts)
    backups_dir = Keyword.get(opts, :backups_dir, Path.join(data_dir, "backups"))

    unless File.exists?(database_path) do
      raise "cannot create backup because SQLite database does not exist at #{database_path}"
    end

    File.mkdir_p!(backups_dir)
    timestamp = timestamp()
    reason = Keyword.get(opts, :reason, :manual)
    artifact_path = Path.join(backups_dir, "manavault-#{reason}-#{timestamp}.zip")
    stage_dir = temp_dir("manavault-backup", timestamp)

    File.rm_rf!(stage_dir)
    File.mkdir_p!(stage_dir)

    try do
      Snapshot.create!(repo, Path.join(stage_dir, @db_name))

      copy_local_paths!(
        data_dir,
        stage_dir,
        Keyword.get(opts, :local_paths, @default_local_paths)
      )

      write_manifest!(stage_dir, data_dir, database_path, reason)
      Archive.create!(stage_dir, artifact_path)
      artifact_path
    after
      File.rm_rf!(stage_dir)
    end
  end

  defp copy_local_paths!(data_dir, stage_dir, local_paths) do
    for relative_path <- local_paths do
      source = Path.join(data_dir, relative_path)

      if File.exists?(source) do
        destination = Path.join(stage_dir, relative_path)
        File.mkdir_p!(Path.dirname(destination))
        File.cp_r!(source, destination)
      end
    end
  end

  defp write_manifest!(stage_dir, data_dir, database_path, reason) do
    manifest = %{
      app: "manavault",
      version: Application.spec(@app, :vsn) |> to_string(),
      created_at: DateTime.utc_now() |> DateTime.to_iso8601(),
      reason: to_string(reason),
      data_dir: data_dir,
      database_path: database_path,
      includes: [@db_name | @default_local_paths]
    }

    File.write!(Path.join(stage_dir, @manifest_name), Jason.encode!(manifest, pretty: true))
  end

  defp temp_dir(prefix, timestamp) do
    Path.join(System.tmp_dir!(), "#{prefix}-#{timestamp}-#{System.unique_integer([:positive])}")
  end

  defp timestamp, do: DateTime.utc_now() |> Calendar.strftime("%Y%m%dT%H%M%SZ")
end
