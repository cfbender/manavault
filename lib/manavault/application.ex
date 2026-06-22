defmodule Manavault.Application do
  # See https://elixir.hexdocs.pm/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children =
      [
        ManavaultWeb.Telemetry,
        Manavault.Backup.PendingRestore,
        Manavault.Repo,
        {Manavault.Backup.MigrationBackup, repo: Manavault.Repo},
        {Ecto.Migrator,
         repos: Application.fetch_env!(:manavault, :ecto_repos), skip: skip_migrations?()},
        {DNSCluster, query: Application.get_env(:manavault, :dns_cluster_query) || :ignore},
        {Phoenix.PubSub, name: Manavault.PubSub},
        {Task.Supervisor, name: Manavault.ScanRecognitionSupervisor},
        {Task.Supervisor, name: Manavault.Backup.TaskSupervisor},
        Manavault.Catalog.RapidOCRDaemon,
        Manavault.Catalog.ImageHashDaemon,
        art_index_worker_child(),
        scryfall_sync_worker_child(),
        backup_scheduler_child(),
        ManavaultWeb.Endpoint
      ]
      |> Enum.reject(&is_nil/1)

    # See https://elixir.hexdocs.pm/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: Manavault.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    ManavaultWeb.Endpoint.config_change(changed, removed)
    :ok
  end

  defp skip_migrations?() do
    # By default, sqlite migrations are run when using a release
    System.get_env("RELEASE_NAME") == nil
  end

  defp backup_scheduler_child do
    if Application.get_env(:manavault, :backup_scheduler, true) do
      Manavault.Backup.Scheduler
    end
  end

  defp scryfall_sync_worker_child do
    if Application.get_env(:manavault, :scryfall_sync_worker, true) do
      Manavault.Catalog.ScryfallSyncWorker
    end
  end

  defp art_index_worker_child do
    if Application.get_env(:manavault, :scan_art_index_worker, true) and
         Application.get_env(:manavault, :scan_image_matching, true) do
      Manavault.Catalog.ArtIndexWorker
    end
  end
end
