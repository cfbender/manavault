defmodule Manavault.Auth.AttemptLimiter do
  @moduledoc false

  use GenServer

  import Ecto.Query

  alias Manavault.Auth.ClientFailure
  alias Manavault.Repo

  @default_window_ms :timer.minutes(15)
  @default_max_attempts_per_ip 5
  @default_max_attempts_global 30
  @default_permanent_ban_after_failures 30
  @global_key :global

  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, %{}, name: name)
  end

  def check(client_id) do
    GenServer.call(__MODULE__, {:check, client_id})
  end

  def record_failure(client_id) do
    GenServer.call(__MODULE__, {:record_failure, client_id})
  end

  def reset(client_id) do
    GenServer.call(__MODULE__, {:reset, client_id})
  end

  def reset_all do
    GenServer.call(__MODULE__, :reset_all)
  end

  @impl true
  def init(state), do: {:ok, state}

  @impl true
  def handle_call({:check, client_id}, _from, attempts) do
    now = now_ms()
    attempts = prune_expired(attempts, now)

    cond do
      permanently_banned?(client_id) ->
        {:reply, :permanently_banned, attempts}

      retry_after = retry_after(attempts, client_id, now) ->
        {:reply, {:rate_limited, retry_after}, attempts}

      true ->
        {:reply, :ok, attempts}
    end
  end

  def handle_call({:record_failure, client_id}, _from, attempts) do
    now = now_ms()

    attempts =
      attempts
      |> prune_expired(now)
      |> increment({:client, client_id}, now)
      |> increment(@global_key, now)

    {:reply, record_persistent_failure(client_id), attempts}
  end

  def handle_call({:reset, client_id}, _from, attempts) do
    delete_persistent_failure(client_id)

    {:reply, :ok, Map.delete(attempts, {:client, client_id})}
  end

  def handle_call(:reset_all, _from, _attempts) do
    Repo.delete_all(ClientFailure)

    {:reply, :ok, %{}}
  end

  defp retry_after(attempts, client_id, now) do
    attempts
    |> Enum.reduce(nil, fn
      {{:client, ^client_id}, attempt}, retry_after ->
        retry_after_if_limited(attempt, :per_ip, now, retry_after)

      {@global_key, attempt}, retry_after ->
        retry_after_if_limited(attempt, :global, now, retry_after)

      _entry, retry_after ->
        retry_after
    end)
  end

  defp retry_after_if_limited(%{count: count, expires_at: expires_at}, scope, now, retry_after) do
    if count >= limit(scope) do
      seconds = max(1, ceil((expires_at - now) / 1000))
      max(retry_after || 0, seconds)
    else
      retry_after
    end
  end

  defp increment(attempts, key, now) do
    Map.update(attempts, key, fresh_attempt(now), fn attempt ->
      %{attempt | count: attempt.count + 1}
    end)
  end

  defp fresh_attempt(now) do
    %{count: 1, expires_at: now + window_ms()}
  end

  defp prune_expired(attempts, now) do
    Map.reject(attempts, fn {_key, %{expires_at: expires_at}} -> expires_at <= now end)
  end

  defp permanently_banned?(client_id) do
    match?(
      %ClientFailure{banned_at: %DateTime{}},
      Repo.get_by(ClientFailure, client_id: client_id)
    )
  end

  defp record_persistent_failure(client_id) do
    client_failure =
      Repo.get_by(ClientFailure, client_id: client_id) || %ClientFailure{client_id: client_id}

    failed_attempts = client_failure.failed_attempts + 1

    client_failure
    |> ClientFailure.changeset(%{
      failed_attempts: failed_attempts,
      banned_at: banned_at(failed_attempts)
    })
    |> Repo.insert_or_update!()

    if failed_attempts >= permanent_ban_after_failures(), do: :banned, else: :ok
  end

  defp banned_at(failed_attempts) do
    if failed_attempts >= permanent_ban_after_failures() do
      DateTime.utc_now() |> DateTime.truncate(:second)
    end
  end

  defp delete_persistent_failure(client_id) do
    from(failure in ClientFailure, where: failure.client_id == ^client_id)
    |> Repo.delete_all()
  end

  defp now_ms, do: System.monotonic_time(:millisecond)

  defp limit(:per_ip), do: auth_rate_limit(:max_attempts_per_ip, @default_max_attempts_per_ip)
  defp limit(:global), do: auth_rate_limit(:max_attempts_global, @default_max_attempts_global)
  defp window_ms, do: auth_rate_limit(:window_ms, @default_window_ms)

  defp permanent_ban_after_failures do
    auth_rate_limit(:permanent_ban_after_failures, @default_permanent_ban_after_failures)
  end

  defp auth_rate_limit(key, default) do
    :manavault
    |> Application.get_env(:auth_rate_limit, [])
    |> Keyword.get(key, default)
  end
end
