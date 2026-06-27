defmodule Manavault.Backup.RetentionTest do
  use ExUnit.Case, async: true

  alias Manavault.Backup.CloudSettings
  alias Manavault.Backup.Retention

  test "keeps the newest backups within the configured count" do
    uploaded = backup("new.zip", ~U[2026-06-27 03:00:00Z])

    backups = [
      backup("middle.zip", ~U[2026-06-26 03:00:00Z]),
      backup("old.zip", ~U[2026-06-25 03:00:00Z])
    ]

    assert {:ok, %{deleted: [deleted]}} =
             Retention.prune(
               %CloudSettings{retention_count: 2},
               uploaded,
               backups,
               fn backup -> delete_backup(backup) end
             )

    assert deleted.name == "old.zip"
    assert_received {:deleted, "old.zip"}
    refute_received {:deleted, "middle.zip"}
  end

  test "keeps all backups when retention is blank" do
    assert {:ok, %{deleted: []}} =
             Retention.prune(
               %CloudSettings{retention_count: nil},
               backup("new.zip", ~U[2026-06-27 03:00:00Z]),
               [backup("old.zip", ~U[2026-06-25 03:00:00Z])],
               fn backup -> delete_backup(backup) end
             )

    refute_received {:deleted, _id}
  end

  test "reports delete failures without hiding already deleted backups" do
    uploaded = backup("new.zip", ~U[2026-06-27 03:00:00Z])

    backups = [
      backup("middle.zip", ~U[2026-06-26 03:00:00Z]),
      backup("old.zip", ~U[2026-06-25 03:00:00Z])
    ]

    assert {:error, message} =
             Retention.prune(
               %CloudSettings{retention_count: 1},
               uploaded,
               backups,
               fn
                 %{id: "middle.zip"} -> {:error, "permission denied"}
                 backup -> delete_backup(backup)
               end
             )

    assert message =~ "failed to prune 1 old cloud backup: middle.zip: permission denied"
    assert message =~ "1 old cloud backup was deleted before the failure"
    assert_received {:deleted, "old.zip"}
  end

  defp delete_backup(backup) do
    send(self(), {:deleted, backup.id})
    :ok
  end

  defp backup(name, modified_at) do
    %{id: name, name: name, provider: "s3", size: 1, modified_at: modified_at}
  end
end
