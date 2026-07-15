defmodule Manavault.Catalog.CacheTest.CacheBoundary do
  def fetch(_key), do: execute(:catalog_cache_fetch)

  def put(_key, _value, _opts), do: execute(:catalog_cache_put)

  defp execute(action) do
    case Process.get(action, :miss) do
      {:raise, exception} -> raise exception
      {:throw, reason} -> throw(reason)
      {:exit, reason} -> exit(reason)
      result -> result
    end
  end
end

defmodule Manavault.Catalog.CacheTest do
  use ExUnit.Case, async: true

  import ExUnit.CaptureLog

  alias __MODULE__.CacheBoundary
  alias Manavault.Catalog.Cache

  setup do
    Process.put(:catalog_cache_fetch, :miss)
    Process.put(:catalog_cache_put, :ok)
    :ok
  end

  test "a cache hit does not invoke the producer" do
    Process.put(:catalog_cache_fetch, {:ok, :cached_value})
    ref = make_ref()

    assert :cached_value = Cache.cached(:hit, [cache: CacheBoundary], producer(:produced_value, ref))

    refute_received {:producer_called, ^ref}
  end

  test "a cache miss invokes the producer once" do
    ref = make_ref()

    assert :produced_value = Cache.cached(:miss, [cache: CacheBoundary], producer(:produced_value, ref))

    assert_produced_once(ref)
  end

  test "a cache fetch error is logged and invokes the producer once" do
    Process.put(:catalog_cache_fetch, {:error, :cache_unavailable})
    ref = make_ref()

    log =
      capture_log(fn ->
        assert :produced_value =
                 Cache.cached(:fetch_error, [cache: CacheBoundary], producer(:produced_value, ref))
      end)

    assert log =~ "catalog cache unavailable"
    assert_produced_once(ref)
  end

  test "a raised cache fetch failure is logged and invokes the producer once" do
    Process.put(:catalog_cache_fetch, {:raise, RuntimeError.exception("cache unavailable")})
    ref = make_ref()

    log =
      capture_log(fn ->
        assert :produced_value =
                 Cache.cached(:fetch_raises, [cache: CacheBoundary], producer(:produced_value, ref))
      end)

    assert log =~ "catalog cache raised"
    assert_produced_once(ref)
  end

  test "a cache put failure returns the produced value" do
    Process.put(:catalog_cache_put, {:raise, RuntimeError.exception("cache unavailable")})
    ref = make_ref()

    log =
      capture_log(fn ->
        assert :produced_value =
                 Cache.cached(:put_raises, [cache: CacheBoundary], producer(:produced_value, ref))
      end)

    assert log =~ "catalog cache raised"
    assert_produced_once(ref)
  end

  test "a producer raise propagates unchanged without a cache failure log" do
    ref = make_ref()

    log =
      capture_log(fn ->
        assert_raise RuntimeError, "producer failure", fn ->
          Cache.cached(:producer_raise, [cache: CacheBoundary], fn ->
            send(self(), {:producer_called, ref})
            raise "producer failure"
          end)
        end
      end)

    refute log =~ "catalog cache"
    assert_produced_once(ref)
  end

  test "a producer throw propagates unchanged without a cache failure log" do
    ref = make_ref()

    log =
      capture_log(fn ->
        assert catch_throw(
                 Cache.cached(:producer_throw, [cache: CacheBoundary], fn ->
                   send(self(), {:producer_called, ref})
                   throw(:producer_throw)
                 end)
               ) == :producer_throw
      end)

    refute log =~ "catalog cache"
    assert_produced_once(ref)
  end

  test "a producer exit propagates unchanged without a cache failure log" do
    ref = make_ref()

    log =
      capture_log(fn ->
        assert catch_exit(
                 Cache.cached(:producer_exit, [cache: CacheBoundary], fn ->
                   send(self(), {:producer_called, ref})
                   exit(:producer_exit)
                 end)
               ) == :producer_exit
      end)

    refute log =~ "catalog cache"
    assert_produced_once(ref)
  end

  defp producer(value, ref) do
    fn ->
      send(self(), {:producer_called, ref})
      value
    end
  end

  defp assert_produced_once(ref) do
    assert_received {:producer_called, ^ref}
    refute_received {:producer_called, ^ref}
  end
end
