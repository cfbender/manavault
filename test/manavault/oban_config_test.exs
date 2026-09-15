defmodule Manavault.ObanConfigTest do
  use ExUnit.Case, async: true

  alias Manavault.Backup.CloudBackupWorker
  alias Manavault.Catalog.{ScryfallAssetsWorker, ScryfallCatalogWorker}
  alias Manavault.Pricing.VendorSyncWorker

  test "background queues and periodic jobs are centrally configured" do
    config = Application.fetch_env!(:manavault, Oban)

    assert Keyword.fetch!(config, :queues) ==
             [ai: 2, backup: 1, catalog: 2, preview: 2, pricing: 1]

    plugins = Keyword.fetch!(config, :plugins)
    cron_options = Keyword.fetch!(plugins, Oban.Plugins.Cron)

    assert Keyword.fetch!(cron_options, :crontab) == [
             {"@reboot", ScryfallCatalogWorker},
             {"@daily", ScryfallCatalogWorker},
             {"@reboot", ScryfallAssetsWorker},
             {"@daily", ScryfallAssetsWorker},
             {"@reboot", VendorSyncWorker},
             {"*/30 * * * *", VendorSyncWorker},
             {"* * * * *", CloudBackupWorker}
           ]
  end

  test "orphan recovery allows every worker to reach its execution timeout first" do
    plugins = Application.fetch_env!(:manavault, Oban) |> Keyword.fetch!(:plugins)
    options = Keyword.fetch!(plugins, Oban.Plugins.Lifeline)
    assert Keyword.fetch!(options, :rescue_after) == :timer.hours(1)

    {:ok, modules} = :application.get_key(:manavault, :modules)

    workers =
      Enum.filter(modules, fn module ->
        Code.ensure_loaded!(module)
        function_exported?(module, :__opts__, 0) and function_exported?(module, :perform, 1)
      end)

    assert ScryfallCatalogWorker in workers

    for worker <- workers do
      timeout = worker.timeout(%Oban.Job{})
      assert is_integer(timeout) and timeout < options[:rescue_after], inspect(worker)
    end
  end
end
