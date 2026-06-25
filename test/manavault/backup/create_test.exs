defmodule Manavault.Backup.CreateTestRepo do
  use Ecto.Repo,
    otp_app: :manavault,
    adapter: Ecto.Adapters.SQLite3

  @impl true
  def init(_type, config) do
    {:ok, Keyword.merge(config, Application.get_env(:manavault, __MODULE__, []))}
  end
end

defmodule Manavault.Backup.CreateTest do
  use ExUnit.Case, async: false

  alias Manavault.Backup
  alias Manavault.Backup.CreateTestRepo
  alias Exqlite.Sqlite3

  @catalog_tables ~w[
    scryfall_printing_search
    scryfall_syncs
    scryfall_printings
    scryfall_cards
  ]

  setup do
    tmp_dir =
      Path.join(
        System.tmp_dir!(),
        "manavault-backup-create-test-#{System.unique_integer([:positive])}"
      )

    source_db = Path.join(tmp_dir, "source.db")
    backups_dir = Path.join(tmp_dir, "backups")
    previous_config = Application.get_env(:manavault, CreateTestRepo)

    File.rm_rf!(tmp_dir)
    File.mkdir_p!(tmp_dir)

    Application.put_env(:manavault, CreateTestRepo,
      database: source_db,
      pool_size: 1,
      stacktrace: true,
      show_sensitive_data_on_connection_error: true
    )

    on_exit(fn ->
      if previous_config do
        Application.put_env(:manavault, CreateTestRepo, previous_config)
      else
        Application.delete_env(:manavault, CreateTestRepo)
      end

      File.rm_rf!(tmp_dir)
    end)

    %{tmp_dir: tmp_dir, source_db: source_db, backups_dir: backups_dir}
  end

  test "backup artifact omits replaceable Scryfall catalog rows without changing the source database",
       %{
         tmp_dir: tmp_dir,
         source_db: source_db,
         backups_dir: backups_dir
       } do
    create_source_database!(source_db)
    start_supervised!(CreateTestRepo)

    artifact_path =
      Backup.create!(repo: CreateTestRepo, data_dir: tmp_dir, backups_dir: backups_dir)

    artifact_db = extract_backup_database!(artifact_path, tmp_dir)

    for table <- @catalog_tables do
      assert row_count(artifact_db, table) == 0
      assert row_count(source_db, table) == 1
    end

    assert row_count(artifact_db, "collection_items") == 1
    assert row_count(source_db, "collection_items") == 1
  end

  defp create_source_database!(path) do
    with_db(path, fn db ->
      execute!(db, """
      PRAGMA foreign_keys = ON;

      CREATE TABLE scryfall_cards (
        oracle_id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );

      CREATE TABLE scryfall_printings (
        scryfall_id TEXT PRIMARY KEY,
        oracle_id TEXT NOT NULL REFERENCES scryfall_cards(oracle_id) ON DELETE CASCADE,
        set_code TEXT NOT NULL,
        collector_number TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE scryfall_printing_search USING fts5(
        scryfall_id UNINDEXED,
        name
      );

      CREATE TABLE scryfall_syncs (
        id INTEGER PRIMARY KEY,
        status TEXT NOT NULL,
        bulk_type TEXT NOT NULL
      );

      CREATE TABLE collection_items (
        id INTEGER PRIMARY KEY,
        scryfall_id TEXT NOT NULL REFERENCES scryfall_printings(scryfall_id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL
      );

      INSERT INTO scryfall_cards (oracle_id, name)
      VALUES ('oracle-1', 'Black Lotus');

      INSERT INTO scryfall_printings (scryfall_id, oracle_id, set_code, collector_number)
      VALUES ('printing-1', 'oracle-1', 'lea', '232');

      INSERT INTO scryfall_printing_search (scryfall_id, name)
      VALUES ('printing-1', 'black lotus');

      INSERT INTO scryfall_syncs (status, bulk_type)
      VALUES ('completed', 'default_cards');

      INSERT INTO collection_items (scryfall_id, quantity)
      VALUES ('printing-1', 1);
      """)
    end)
  end

  defp extract_backup_database!(artifact_path, tmp_dir) do
    extract_dir = Path.join(tmp_dir, "extracted")
    File.rm_rf!(extract_dir)
    File.mkdir_p!(extract_dir)

    case :zip.extract(to_charlist(artifact_path), cwd: to_charlist(extract_dir)) do
      {:ok, _files} -> Path.join(extract_dir, "manavault.db")
      {:error, reason} -> flunk("failed to extract backup artifact: #{inspect(reason)}")
    end
  end

  defp row_count(path, table) do
    with_db(path, [mode: :readonly], fn db ->
      [[count]] = query!(db, "SELECT COUNT(*) FROM #{table}")
      count
    end)
  end

  defp with_db(path, opts \\ [], fun) do
    {:ok, db} = Sqlite3.open(path, opts)

    try do
      fun.(db)
    after
      :ok = Sqlite3.close(db)
    end
  end

  defp execute!(db, sql) do
    case Sqlite3.execute(db, sql) do
      :ok -> :ok
      {:error, reason} -> flunk("failed to execute SQL: #{inspect(reason)}")
    end
  end

  defp query!(db, sql) do
    {:ok, statement} = Sqlite3.prepare(db, sql)

    try do
      case Sqlite3.multi_step(db, statement) do
        {:done, rows} -> rows
        {:rows, rows} -> rows
        {:error, reason} -> flunk("failed to query SQLite: #{inspect(reason)}")
      end
    after
      Sqlite3.release(db, statement)
    end
  end
end
