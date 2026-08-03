defmodule Manavault.PublicShareRequestLimiter do
  @moduledoc false

  use GenServer

  @default_window_ms :timer.minutes(1)
  @default_max_requests_per_ip 120
  @default_max_requests_global 1_200

  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, nil, name: name)
  end

  def check(client_id) do
    GenServer.call(__MODULE__, {:check, client_id})
  end

  def reset do
    GenServer.call(__MODULE__, :reset)
  end

  @impl true
  def init(_opts), do: {:ok, fresh_window(now_ms())}

  @impl true
  def handle_call({:check, client_id}, _from, state) do
    now = now_ms()
    state = if now >= state.expires_at, do: fresh_window(now), else: state
    client_count = Map.get(state.clients, client_id, 0)

    cond do
      state.global_count >= limit(:global) ->
        {:reply, {:rate_limited, retry_after(state, now)}, state}

      client_count >= limit(:per_ip) ->
        {:reply, {:rate_limited, retry_after(state, now)}, state}

      true ->
        state = %{
          state
          | global_count: state.global_count + 1,
            clients: Map.put(state.clients, client_id, client_count + 1)
        }

        {:reply, :ok, state}
    end
  end

  def handle_call(:reset, _from, _state) do
    {:reply, :ok, fresh_window(now_ms())}
  end

  defp fresh_window(now) do
    %{expires_at: now + window_ms(), global_count: 0, clients: %{}}
  end

  defp retry_after(state, now), do: max(1, ceil((state.expires_at - now) / 1000))
  defp now_ms, do: System.monotonic_time(:millisecond)

  defp limit(:per_ip),
    do: rate_limit(:max_requests_per_ip, @default_max_requests_per_ip)

  defp limit(:global),
    do: rate_limit(:max_requests_global, @default_max_requests_global)

  defp window_ms, do: rate_limit(:window_ms, @default_window_ms)

  defp rate_limit(key, default) do
    :manavault
    |> Application.get_env(:public_share_rate_limit, [])
    |> Keyword.get(key, default)
  end
end
