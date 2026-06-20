defmodule Manavault.Catalog.ScryfallSyncWorkerTest do
  use ExUnit.Case, async: false

  alias Manavault.Catalog.ScryfallSyncWorker

  @interval :timer.hours(24)

  test "runs catalog and asset syncs when both are stale" do
    test_pid = self()

    start_supervised!(
      {ScryfallSyncWorker,
       [
         interval: @interval,
         initial_delay: 0,
         latest_sync_fun: fn -> nil end,
         sync_fun: fn ->
           send(test_pid, :catalog_sync)
           {:ok, %{printings_count: 10}}
         end,
         latest_asset_sync_fun: fn -> nil end,
         asset_sync_fun: fn ->
           send(test_pid, :asset_sync)
           {:ok, %{symbols_count: 2, sets_count: 3}}
         end
       ]}
    )

    assert_receive :catalog_sync
    assert_receive :asset_sync
  end

  test "runs asset sync independently when only assets are stale" do
    test_pid = self()
    fresh_completed_at = DateTime.utc_now()

    start_supervised!(
      {ScryfallSyncWorker,
       [
         interval: @interval,
         initial_delay: 0,
         latest_sync_fun: fn ->
           %{status: "succeeded", completed_at: fresh_completed_at}
         end,
         sync_fun: fn ->
           send(test_pid, :catalog_sync)
           {:ok, %{printings_count: 10}}
         end,
         latest_asset_sync_fun: fn -> nil end,
         asset_sync_fun: fn ->
           send(test_pid, :asset_sync)
           {:ok, %{symbols_count: 2, sets_count: 3}}
         end
       ]}
    )

    assert_receive :asset_sync
    refute_receive :catalog_sync, 50
  end

  test "skips syncs when catalog and assets are fresh" do
    test_pid = self()
    fresh_completed_at = DateTime.utc_now()

    start_supervised!(
      {ScryfallSyncWorker,
       [
         interval: @interval,
         initial_delay: 0,
         latest_sync_fun: fn ->
           send(test_pid, :catalog_checked)
           %{status: "succeeded", completed_at: fresh_completed_at}
         end,
         sync_fun: fn ->
           send(test_pid, :catalog_sync)
           {:ok, %{printings_count: 10}}
         end,
         latest_asset_sync_fun: fn ->
           send(test_pid, :assets_checked)
           fresh_completed_at
         end,
         asset_sync_fun: fn ->
           send(test_pid, :asset_sync)
           {:ok, %{symbols_count: 2, sets_count: 3}}
         end
       ]}
    )

    assert_receive :catalog_checked
    assert_receive :assets_checked
    refute_receive :catalog_sync, 50
    refute_receive :asset_sync, 50
  end
end
