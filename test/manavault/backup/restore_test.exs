defmodule Manavault.Backup.RestoreTest do
  use ExUnit.Case, async: false

  alias Manavault.Backup

  @db_name "manavault.db"

  setup do
    tmp_dir =
      Path.join(
        System.tmp_dir!(),
        "manavault-backup-restore-test-#{System.unique_integer([:positive])}"
      )

    data_dir = Path.join(tmp_dir, "data")
    database_path = Path.join(data_dir, @db_name)

    File.rm_rf!(tmp_dir)
    File.mkdir_p!(data_dir)

    on_exit(fn -> File.rm_rf!(tmp_dir) end)

    %{tmp_dir: tmp_dir, data_dir: data_dir, database_path: database_path}
  end

  # A repo module name that has no running process, so restore!'s "app is
  # running" guard passes and we exercise the extraction path itself.
  @stopped_repo Manavault.Backup.RestoreTest.StoppedRepo

  test "refuses to extract an archive whose entries escape the extract directory (zip-slip)", %{
    tmp_dir: tmp_dir,
    data_dir: data_dir,
    database_path: database_path
  } do
    escape_target = Path.join(tmp_dir, "escaped.txt")
    artifact_path = Path.join(tmp_dir, "malicious.zip")

    # `:zip.create` preserves a `../` traversal entry verbatim; extraction must
    # be refused before any entry (including the benign db) is written.
    build_zip!(artifact_path, [
      {@db_name, "not-a-real-db"},
      {"../escaped.txt", "pwned"}
    ])

    assert_raise RuntimeError, ~r/escapes/, fn ->
      Backup.restore!(artifact_path,
        repo: @stopped_repo,
        database_path: database_path,
        data_dir: data_dir
      )
    end

    refute File.exists?(escape_target)
    refute File.exists?(database_path)
  end

  defp build_zip!(artifact_path, entries) do
    zip_entries =
      Enum.map(entries, fn {name, contents} ->
        {to_charlist(name), contents}
      end)

    {:ok, _} = :zip.create(to_charlist(artifact_path), zip_entries)
    :ok
  end
end
