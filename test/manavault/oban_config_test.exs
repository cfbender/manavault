defmodule Manavault.ObanConfigTest do
  use ExUnit.Case, async: true

  alias Manavault.Backup.CloudBackupWorker
  alias Manavault.Catalog.{ScryfallAssetsWorker, ScryfallCatalogWorker}
  alias Manavault.Pricing.VendorSyncWorker

  test "background queues and periodic jobs are centrally configured" do
    config = Application.fetch_env!(:manavault, Oban)

    assert Keyword.fetch!(config, :queues) ==
             [ai: 2, backup: 1, catalog: 2, preview: 2, pricing: 1]

    assert [{Oban.Plugins.Cron, cron_options}] = Keyword.fetch!(config, :plugins)

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
end
