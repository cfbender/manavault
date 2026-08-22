defmodule Manavault.Backup.CloudBackupWorkerTest do
  use Manavault.DataCase, async: false
  use Oban.Testing, repo: Manavault.Repo, engine: Oban.Engines.Lite

  alias Manavault.Backup.CloudBackupWorker
  alias Manavault.Backup.Settings

  test "disabled scheduled backups finish without running" do
    assert {:ok, _settings} =
             Settings.update(%{enabled: false, provider: "none", cron: "* * * * *"})

    assert :ok = perform_job(CloudBackupWorker, %{})
  end

  test "only one backup tick may be pending at a time" do
    assert {:ok, job} = Oban.insert(CloudBackupWorker.new(%{}))
    assert {:ok, duplicate_job} = Oban.insert(CloudBackupWorker.new(%{}))

    assert duplicate_job.id == job.id
    assert duplicate_job.conflict?
    assert_enqueued(worker: CloudBackupWorker)
  end
end
