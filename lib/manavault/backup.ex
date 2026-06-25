defmodule Manavault.Backup do
  @moduledoc """
  Creates and restores portable ManaVault data backups.

  Backups are zip files containing a SQLite database snapshot, a manifest,
  and local user-owned files that need to survive a restore.
  """

  require Logger

  @app :manavault
  @db_name "manavault.db"
  @manifest_name "manifest.json"
  @default_local_paths []
  @catalog_tables ~w(
    scryfall_printing_search
    scryfall_syncs
    scryfall_printings
    scryfall_cards
  )

  alias Exqlite.Sqlite3, as: SQLite
  alias Manavault.Backup.{Cloud, Settings}

  def settings, do: Settings.get!()
  def update_settings(attrs), do: Settings.update(attrs)
  def run_cloud_backup(opts \\ []), do: Cloud.run_backup(opts)
  def list_cloud_backups, do: Cloud.list_backups()
  def stage_cloud_restore(remote_id), do: Cloud.stage_restore(remote_id)

  def create!(opts \\ []) do
    repo = Keyword.get(opts, :repo, Manavault.Repo)
    database_path = database_path!(repo, opts)
    data_dir = data_dir(database_path, opts)
    backups_dir = Keyword.get(opts, :backups_dir, Path.join(data_dir, "backups"))

    if not File.exists?(database_path) do
      raise "cannot create backup because SQLite database does not exist at #{database_path}"
    end

    File.mkdir_p!(backups_dir)

    timestamp = timestamp()
    reason = Keyword.get(opts, :reason, :manual)
    artifact_path = Path.join(backups_dir, "manavault-#{reason}-#{timestamp}.zip")

    stage_dir =
      Path.join(
        System.tmp_dir!(),
        "manavault-backup-#{timestamp}-#{System.unique_integer([:positive])}"
      )

    File.rm_rf!(stage_dir)
    File.mkdir_p!(stage_dir)

    try do
      snapshot_database!(repo, Path.join(stage_dir, @db_name))

      copy_local_paths!(
        data_dir,
        stage_dir,
        Keyword.get(opts, :local_paths, @default_local_paths)
      )

      write_manifest!(stage_dir, data_dir, database_path, reason)
      zip_stage!(stage_dir, artifact_path)
      artifact_path
    after
      File.rm_rf!(stage_dir)
    end
  end

  def restore!(artifact_path, opts \\ []) do
    repo = Keyword.get(opts, :repo, Manavault.Repo)
    database_path = database_path!(repo, opts)
    data_dir = data_dir(database_path, opts)
    backups_dir = Keyword.get(opts, :backups_dir, Path.join(data_dir, "backups"))

    if Process.whereis(repo) do
      raise "refusing to restore while #{inspect(repo)} is running; stop the app before restoring"
    end

    if not File.exists?(artifact_path) do
      raise "backup artifact does not exist at #{artifact_path}"
    end

    timestamp = timestamp()

    extract_dir =
      Path.join(
        System.tmp_dir!(),
        "manavault-restore-#{timestamp}-#{System.unique_integer([:positive])}"
      )

    File.rm_rf!(extract_dir)
    File.mkdir_p!(extract_dir)

    try do
      extract_artifact!(artifact_path, extract_dir)
      extracted_database = Path.join(extract_dir, @db_name)

      if not File.exists?(extracted_database) do
        raise "backup artifact #{artifact_path} does not contain #{@db_name}"
      end

      backup_existing_data!(database_path, data_dir, backups_dir, timestamp)
      File.mkdir_p!(Path.dirname(database_path))
      File.cp!(extracted_database, database_path)
      restore_local_paths!(extract_dir, data_dir, @default_local_paths)

      database_path
    after
      File.rm_rf!(extract_dir)
    end
  end

  def database_path!(repo \\ Manavault.Repo, opts \\ []) do
    Keyword.get(opts, :database_path) ||
      repo.config()
      |> Keyword.fetch!(:database)
      |> Path.expand()
  end

  def data_dir(database_path, opts \\ []) do
    Keyword.get(opts, :data_dir) ||
      System.get_env("DATA_DIR") ||
      database_path
      |> Path.dirname()
      |> Path.expand()
  end

  defp snapshot_database!(repo, snapshot_path) do
    ensure_repo_started!(repo)
    escaped_path = String.replace(snapshot_path, "'", "''")
    Ecto.Adapters.SQL.query!(repo, "VACUUM main INTO '#{escaped_path}'", [])
    prune_snapshot_catalog!(snapshot_path)
  end

  defp prune_snapshot_catalog!(snapshot_path) do
    conn = open_snapshot!(snapshot_path)

    try do
      execute_snapshot!(
        conn,
        snapshot_path,
        "disable foreign-key enforcement",
        "PRAGMA foreign_keys = OFF"
      )

      conn
      |> existing_catalog_tables!(snapshot_path)
      |> Enum.each(&delete_snapshot_table!(conn, snapshot_path, &1))

      execute_snapshot!(conn, snapshot_path, "vacuum pruned snapshot", "VACUUM")
    after
      close_snapshot!(conn, snapshot_path)
    end
  end

  defp open_snapshot!(snapshot_path) do
    if not File.exists?(snapshot_path) do
      raise_snapshot_error!(snapshot_path, "could not open snapshot database", :enoent)
    end

    case SQLite.open(snapshot_path) do
      {:ok, conn} ->
        conn

      {:error, reason} ->
        raise_snapshot_error!(
          snapshot_path,
          "could not open snapshot database",
          reason
        )
    end
  end

  defp existing_catalog_tables!(conn, snapshot_path) do
    placeholders = Enum.map_join(@catalog_tables, ", ", fn _table -> "?" end)

    sql = """
    SELECT name FROM sqlite_schema
    WHERE type = 'table' AND name IN (#{placeholders})
    """

    rows = query_snapshot!(conn, snapshot_path, sql, @catalog_tables)

    existing =
      rows
      |> Enum.map(fn [name] -> name end)
      |> MapSet.new()

    Enum.filter(@catalog_tables, &MapSet.member?(existing, &1))
  end

  defp delete_snapshot_table!(conn, snapshot_path, table) do
    execute_snapshot!(
      conn,
      snapshot_path,
      "delete #{table} rows",
      "DELETE FROM #{table}"
    )
  end

  defp execute_snapshot!(conn, snapshot_path, operation, sql) do
    case SQLite.execute(conn, sql) do
      :ok ->
        :ok

      {:error, reason} ->
        raise_snapshot_error!(snapshot_path, "could not #{operation}", reason)
    end
  end

  defp query_snapshot!(conn, snapshot_path, sql, args) do
    statement = prepare_snapshot_query!(conn, snapshot_path, sql)

    try do
      bind_snapshot_query!(statement, snapshot_path, args)
      fetch_snapshot_rows!(conn, statement, snapshot_path)
    after
      release_snapshot_query!(conn, statement, snapshot_path)
    end
  end

  defp prepare_snapshot_query!(conn, snapshot_path, sql) do
    case SQLite.prepare(conn, sql) do
      {:ok, statement} ->
        statement

      {:error, reason} ->
        raise_snapshot_error!(snapshot_path, "could not query catalog tables", reason)
    end
  end

  defp bind_snapshot_query!(statement, snapshot_path, args) do
    case SQLite.bind(statement, args) do
      :ok ->
        :ok

      {:error, reason} ->
        raise_snapshot_error!(snapshot_path, "could not query catalog tables", reason)
    end
  end

  defp fetch_snapshot_rows!(conn, statement, snapshot_path) do
    case SQLite.fetch_all(conn, statement) do
      {:ok, rows} ->
        rows

      {:error, reason} ->
        raise_snapshot_error!(snapshot_path, "could not query catalog tables", reason)
    end
  end

  defp release_snapshot_query!(conn, statement, snapshot_path) do
    case SQLite.release(conn, statement) do
      :ok ->
        :ok

      {:error, reason} ->
        raise_snapshot_error!(snapshot_path, "could not release catalog query", reason)
    end
  end

  defp close_snapshot!(conn, snapshot_path) do
    case SQLite.close(conn) do
      :ok ->
        :ok

      {:error, reason} ->
        raise_snapshot_error!(snapshot_path, "could not close snapshot database", reason)
    end
  end

  defp raise_snapshot_error!(snapshot_path, message, reason) do
    raise "failed to prune backup snapshot #{snapshot_path}: " <>
            "#{message}: #{inspect(reason)}"
  end

  defp ensure_repo_started!(repo) do
    if Process.whereis(repo) do
      :ok
    else
      {:ok, _} = Application.ensure_all_started(:ecto_sql)

      case repo.start_link() do
        {:ok, _pid} ->
          :ok

        {:error, {:already_started, _pid}} ->
          :ok

        {:error, reason} ->
          raise "could not start #{inspect(repo)} for backup: #{inspect(reason)}"
      end
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

  defp zip_stage!(stage_dir, artifact_path) do
    files =
      stage_dir
      |> Path.join("**/*")
      |> Path.wildcard()
      |> Enum.filter(&File.regular?/1)
      |> Enum.map(&Path.relative_to(&1, stage_dir))

    case :zip.create(to_charlist(artifact_path), Enum.map(files, &to_charlist/1),
           cwd: to_charlist(stage_dir)
         ) do
      {:ok, _} -> :ok
      {:error, reason} -> raise "failed to write backup #{artifact_path}: #{inspect(reason)}"
    end
  end

  defp extract_artifact!(artifact_path, extract_dir) do
    case :zip.extract(to_charlist(artifact_path), cwd: to_charlist(extract_dir)) do
      {:ok, _files} -> :ok
      {:error, reason} -> raise "failed to extract backup #{artifact_path}: #{inspect(reason)}"
    end
  end

  defp backup_existing_data!(database_path, data_dir, backups_dir, timestamp) do
    existing = Enum.filter([database_path | local_absolute_paths(data_dir)], &File.exists?/1)

    if existing != [] do
      destination = Path.join(backups_dir, "pre-restore-#{timestamp}")
      File.mkdir_p!(destination)

      for path <- existing do
        relative_path =
          if path == database_path do
            @db_name
          else
            Path.relative_to(path, data_dir)
          end

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

  defp local_absolute_paths(data_dir) do
    Enum.map(@default_local_paths, &Path.join(data_dir, &1))
  end

  defp timestamp do
    DateTime.utc_now()
    |> Calendar.strftime("%Y%m%dT%H%M%SZ")
  end
end
