defmodule Manavault.Backup.Snapshot do
  @moduledoc false

  alias Exqlite.Sqlite3, as: SQLite

  @catalog_tables ~w(scryfall_syncs scryfall_printings scryfall_cards)

  def create!(repo, snapshot_path) do
    ensure_repo_started!(repo)
    escaped_path = String.replace(snapshot_path, "'", "''")
    Ecto.Adapters.SQL.query!(repo, "VACUUM main INTO '#{escaped_path}'", [])
    prune_catalog!(snapshot_path)
  end

  defp prune_catalog!(snapshot_path) do
    conn = open!(snapshot_path)

    try do
      execute!(
        conn,
        snapshot_path,
        "disable foreign-key enforcement",
        "PRAGMA foreign_keys = OFF"
      )

      conn
      |> existing_catalog_tables!(snapshot_path)
      |> Enum.each(&delete_table!(conn, snapshot_path, &1))

      execute!(conn, snapshot_path, "vacuum pruned snapshot", "VACUUM")
    after
      close!(conn, snapshot_path)
    end
  end

  defp open!(snapshot_path) do
    unless File.exists?(snapshot_path),
      do: raise_error!(snapshot_path, "could not open snapshot database", :enoent)

    case SQLite.open(snapshot_path) do
      {:ok, conn} -> conn
      {:error, reason} -> raise_error!(snapshot_path, "could not open snapshot database", reason)
    end
  end

  defp existing_catalog_tables!(conn, snapshot_path) do
    placeholders = Enum.map_join(@catalog_tables, ", ", fn _table -> "?" end)

    rows =
      query!(
        conn,
        snapshot_path,
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN (#{placeholders})",
        @catalog_tables
      )

    existing = rows |> Enum.map(fn [name] -> name end) |> MapSet.new()
    Enum.filter(@catalog_tables, &MapSet.member?(existing, &1))
  end

  defp delete_table!(conn, snapshot_path, table) do
    execute!(conn, snapshot_path, "delete #{table} rows", "DELETE FROM #{table}")
  end

  defp execute!(conn, snapshot_path, operation, sql) do
    case SQLite.execute(conn, sql) do
      :ok -> :ok
      {:error, reason} -> raise_error!(snapshot_path, "could not #{operation}", reason)
    end
  end

  defp query!(conn, snapshot_path, sql, args) do
    statement = prepare!(conn, snapshot_path, sql)

    try do
      bind!(statement, snapshot_path, args)
      fetch!(conn, statement, snapshot_path)
    after
      release!(conn, statement, snapshot_path)
    end
  end

  defp prepare!(conn, snapshot_path, sql) do
    case SQLite.prepare(conn, sql) do
      {:ok, statement} -> statement
      {:error, reason} -> raise_error!(snapshot_path, "could not query catalog tables", reason)
    end
  end

  defp bind!(statement, snapshot_path, args) do
    case SQLite.bind(statement, args) do
      :ok -> :ok
      {:error, reason} -> raise_error!(snapshot_path, "could not query catalog tables", reason)
    end
  end

  defp fetch!(conn, statement, snapshot_path) do
    case SQLite.fetch_all(conn, statement) do
      {:ok, rows} -> rows
      {:error, reason} -> raise_error!(snapshot_path, "could not query catalog tables", reason)
    end
  end

  defp release!(conn, statement, snapshot_path) do
    case SQLite.release(conn, statement) do
      :ok -> :ok
      {:error, reason} -> raise_error!(snapshot_path, "could not release catalog query", reason)
    end
  end

  defp close!(conn, snapshot_path) do
    case SQLite.close(conn) do
      :ok -> :ok
      {:error, reason} -> raise_error!(snapshot_path, "could not close snapshot database", reason)
    end
  end

  defp raise_error!(snapshot_path, message, reason) do
    raise "failed to prune backup snapshot #{snapshot_path}: #{message}: #{inspect(reason)}"
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
end
