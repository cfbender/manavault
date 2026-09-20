defmodule Manavault.Backup.Restore do
  @moduledoc false

  require Logger

  alias Manavault.Backup
  alias Manavault.Backup.Archive

  @db_name "manavault.db"
  @default_local_paths []

  def run!(artifact_path, opts \\ []) do
    repo = Keyword.get(opts, :repo, Manavault.Repo)
    database_path = Backup.database_path!(repo, opts)
    data_dir = Backup.data_dir(database_path, opts)
    backups_dir = Keyword.get(opts, :backups_dir, Path.join(data_dir, "backups"))

    if Process.whereis(repo) do
      raise "refusing to restore while #{inspect(repo)} is running; stop the app before restoring"
    end

    unless File.exists?(artifact_path),
      do: raise("backup artifact does not exist at #{artifact_path}")

    timestamp = timestamp()
    extract_dir = temp_dir(timestamp)
    File.rm_rf!(extract_dir)
    File.mkdir_p!(extract_dir)

    try do
      restore_extracted!(
        artifact_path,
        extract_dir,
        database_path,
        data_dir,
        backups_dir,
        timestamp
      )
    after
      File.rm_rf!(extract_dir)
    end
  end

  defp restore_extracted!(
         artifact_path,
         extract_dir,
         database_path,
         data_dir,
         backups_dir,
         timestamp
       ) do
    Archive.extract!(artifact_path, extract_dir)
    extracted_database = Path.join(extract_dir, @db_name)

    unless File.exists?(extracted_database) do
      raise "backup artifact #{artifact_path} does not contain #{@db_name}"
    end

    backup_existing_data!(database_path, data_dir, backups_dir, timestamp)
    File.mkdir_p!(Path.dirname(database_path))
    File.cp!(extracted_database, database_path)
    restore_local_paths!(extract_dir, data_dir, @default_local_paths)
    database_path
  end

  defp backup_existing_data!(database_path, data_dir, backups_dir, timestamp) do
    existing = Enum.filter([database_path | local_absolute_paths(data_dir)], &File.exists?/1)

    if existing != [] do
      destination = Path.join(backups_dir, "pre-restore-#{timestamp}")
      File.mkdir_p!(destination)

      for path <- existing do
        relative_path =
          if path == database_path, do: @db_name, else: Path.relative_to(path, data_dir)

        target = Path.join(destination, relative_path)
        File.mkdir_p!(Path.dirname(target))
        File.cp_r!(path, target)
      end

      Logger.info("saved pre-restore copy at #{destination}")
    end
  end

  defp restore_local_paths!(extract_dir, data_dir, local_paths) do
    for relative_path <- local_paths do
      source = Path.join(extract_dir, relative_path)
      destination = Path.join(data_dir, relative_path)

      if File.exists?(source) do
        File.rm_rf!(destination)
        File.mkdir_p!(Path.dirname(destination))
        File.cp_r!(source, destination)
      end
    end
  end

  defp local_absolute_paths(data_dir),
    do: Enum.map(@default_local_paths, &Path.join(data_dir, &1))

  defp temp_dir(timestamp) do
    Path.join(
      System.tmp_dir!(),
      "manavault-restore-#{timestamp}-#{System.unique_integer([:positive])}"
    )
  end

  defp timestamp, do: DateTime.utc_now() |> Calendar.strftime("%Y%m%dT%H%M%SZ")
end
