defmodule Manavault.Catalog.Cache do
  @moduledoc false

  require Logger

  alias Manavault.Catalog.Search

  @version 1
  @default_ttl :timer.hours(11)
  @external_ttl :timer.hours(6)

  @catalog_tag :catalog
  @cards_tag :cards
  @collection_tag :collection
  @locations_tag :locations
  @decks_tag :decks
  @home_tag :home
  @auto_sort_rules_tag :auto_sort_rules

  def catalog_tag, do: @catalog_tag
  def cards_tag, do: @cards_tag
  def collection_tag, do: @collection_tag
  def locations_tag, do: @locations_tag
  def decks_tag, do: @decks_tag
  def home_tag, do: @home_tag
  def auto_sort_rules_tag, do: @auto_sort_rules_tag

  def cached(key, opts \\ [], fun) when is_function(fun, 0) do
    key = cache_key(key)
    cache = Keyword.get(opts, :cache, Manavault.Cache)

    cache_opts = [
      ttl: Keyword.get(opts, :ttl, @default_ttl),
      tag: Keyword.get(opts, :tag)
    ]

    case fetch_cached_value(cache, key) do
      {:ok, value} ->
        value

      :miss ->
        value = fun.()
        store_cached_value(cache, key, value, cache_opts)
    end
  end

  def fetch(key) do
    try do
      Manavault.Cache.fetch(cache_key(key))
    rescue
      _error -> :miss
    catch
      _kind, _reason -> :miss
    end
  end

  def put(key, value, opts \\ []) do
    cache_opts = [
      ttl: Keyword.get(opts, :ttl, @default_ttl),
      tag: Keyword.get(opts, :tag)
    ]

    try do
      Manavault.Cache.put(cache_key(key), value, cache_opts)
      value
    rescue
      _error -> value
    catch
      _kind, _reason -> value
    end
  end

  def external_cached(key, opts \\ [], fun) when is_function(fun, 0) do
    opts = Keyword.put_new(opts, :ttl, @external_ttl)
    cached(key, opts, fun)
  end

  def invalidate_catalog do
    Search.clear_card_name_suggestion_cache()

    invalidate([
      @catalog_tag,
      @cards_tag,
      @collection_tag,
      @locations_tag,
      @decks_tag,
      @home_tag,
      @auto_sort_rules_tag
    ])
  end

  def invalidate_collection do
    invalidate([@collection_tag, @locations_tag, @cards_tag, @decks_tag, @home_tag])
  end

  def invalidate_locations do
    invalidate([
      @locations_tag,
      @collection_tag,
      @cards_tag,
      @decks_tag,
      @home_tag,
      @auto_sort_rules_tag
    ])
  end

  def invalidate_decks do
    invalidate([@decks_tag, @collection_tag, @locations_tag, @cards_tag, @home_tag])
  end

  def invalidate_auto_sort_rules do
    invalidate([@auto_sort_rules_tag, @collection_tag, @locations_tag])
  end

  def invalidate(tags) do
    tags
    |> List.wrap()
    |> Enum.each(&delete_tag/1)

    :ok
  end

  def clear do
    try do
      Manavault.Cache.delete_all()
      Search.clear_card_name_suggestion_cache()
      :ok
    rescue
      _error -> :ok
    catch
      _kind, _reason -> :ok
    end
  end

  defp fetch_cached_value(cache, key) do
    try do
      case cache.fetch(key) do
        {:ok, value} ->
          {:ok, value}

        {:error, %Nebulex.KeyError{}} ->
          :miss

        {:error, reason} ->
          log_cache_unavailable(key, reason)
          :miss

        :miss ->
          :miss
      end
    rescue
      error ->
        log_cache_raised(key, error)
        :miss
    catch
      kind, reason ->
        log_cache_threw(key, kind, reason)
        :miss
    end
  end

  defp store_cached_value(cache, key, value, cache_opts) do
    try do
      case cache.put(key, value, cache_opts) do
        {:error, reason} -> log_cache_unavailable(key, reason)
        _result -> :ok
      end
    rescue
      error ->
        log_cache_raised(key, error)
    catch
      kind, reason ->
        log_cache_threw(key, kind, reason)
    end

    value
  end

  defp log_cache_unavailable(key, reason) do
    Logger.warning("catalog cache unavailable for #{inspect(key)}: #{inspect(reason)}")
  end

  defp log_cache_raised(key, error) do
    Logger.warning("catalog cache raised for #{inspect(key)}: #{Exception.message(error)}")
  end

  defp log_cache_threw(key, kind, reason) do
    Logger.warning("catalog cache threw (#{kind}) for #{inspect(key)}: #{inspect(reason)}")
  end

  defp delete_tag(tag) do
    try do
      Manavault.Cache.delete_all(query: tag_match_spec(tag))
      :ok
    rescue
      _error -> :ok
    catch
      _kind, _reason -> :ok
    end
  end

  defp cache_key(key), do: {__MODULE__, @version, key}

  defp tag_match_spec(tag) do
    [{{:entry, :_, :_, :_, :_, tag}, [], [true]}]
  end
end
