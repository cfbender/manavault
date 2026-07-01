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

  test "force reloads catalog and assets without stale checks" do
    test_pid = self()
    fresh_completed_at = DateTime.utc_now()

    pid =
      start_supervised!(
        {ScryfallSyncWorker,
         [
           interval: @interval,
           initial_delay: @interval,
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

    assert :ok = ScryfallSyncWorker.reload_catalog_async(server: pid)
    assert_receive :catalog_sync
    refute_received :catalog_checked

    assert :ok = ScryfallSyncWorker.reload_assets_async(server: pid)
    assert_receive :asset_sync
    refute_received :assets_checked
  end

  test "drops a duplicate catalog reload while a sync is in flight" do
    test_pid = self()

    pid =
      start_supervised!({ScryfallSyncWorker,
       [
         interval: @interval,
         initial_delay: @interval,
         latest_sync_fun: fn -> nil end,
         sync_fun: fn ->
           send(test_pid, {:catalog_running, self()})
           # Block so the task stays in flight while the second reload arrives.
           receive do
             :release -> :ok
           end

           {:ok, %{printings_count: 10}}
         end,
         latest_asset_sync_fun: fn -> nil end,
         asset_sync_fun: fn -> {:ok, %{symbols_count: 0, sets_count: 0}} end
       ]})

    # First reload starts a task that blocks; assert_receive also guarantees the
    # first cast is fully processed (ref stored) before we send the second.
    assert :ok = ScryfallSyncWorker.reload_catalog_async(server: pid)
    assert_receive {:catalog_running, task_pid}
    assert %{catalog_task_ref: ref} = :sys.get_state(pid)
    assert is_reference(ref)

    # Second reload while the first is in flight must be dropped.
    assert :ok = ScryfallSyncWorker.reload_catalog_async(server: pid)
    refute_receive {:catalog_running, _pid}, 50

    # Let the in-flight sync finish; the worker then frees the slot.
    send(task_pid, :release)
    wait_until(fn -> :sys.get_state(pid).catalog_task_ref == nil end)

    # With nothing in flight, a later reload runs again.
    assert :ok = ScryfallSyncWorker.reload_catalog_async(server: pid)
    assert_receive {:catalog_running, next_task_pid}
    send(next_task_pid, :release)
  end

  defp wait_until(fun, retries \\ 100) do
    cond do
      fun.() -> :ok
      retries == 0 -> flunk("condition was not met in time")
      true -> Process.sleep(5) && wait_until(fun, retries - 1)
    end
  end
end
