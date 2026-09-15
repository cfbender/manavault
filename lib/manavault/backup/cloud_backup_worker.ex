defmodule Manavault.Backup.CloudBackupWorker do
  @moduledoc false

  use Oban.Worker,
    queue: :backup,
    max_attempts: 3,
    unique: [period: :infinity, fields: [:worker], states: :incomplete]

  require Logger

  alias Manavault.Backup.{Cloud, Cron, Settings}

  @impl Oban.Worker
  def perform(%Oban.Job{scheduled_at: scheduled_at}) do
    settings = Settings.get!()

    if due?(settings, scheduled_at) do
      backup()
    else
      :ok
    end
  end

  @impl Oban.Worker
  def timeout(_job), do: :timer.minutes(30)

  defp due?(settings, scheduled_at) do
    settings.enabled && settings.provider != "none" && Cron.matches?(settings.cron, scheduled_at)
  end

  defp backup do
    case Cloud.run_backup() do
      {:ok, remote} ->
        Logger.info("scheduled cloud backup uploaded #{remote.name}")
        :ok

      {:error, reason} ->
        Logger.error("scheduled cloud backup failed: #{inspect(reason)}")
        {:error, reason}
    end
  end
end
