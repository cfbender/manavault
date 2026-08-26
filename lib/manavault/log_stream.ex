defmodule Manavault.LogStream do
  @moduledoc false

  use GenServer

  @handler_id :manavault_log_stream
  @max_message_bytes 8_000
  @ansi_escape ~r/\e\[[0-9;]*m/

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, nil, name: __MODULE__)
  end

  @impl true
  def init(nil) do
    :logger.remove_handler(@handler_id)

    :ok =
      :logger.add_handler(@handler_id, Manavault.LogStream.Handler, %{
        config: %{receiver: self()}
      })

    {:ok, nil}
  end

  @impl true
  def handle_info({:server_log, event}, state) do
    log_event = %{
      id: Integer.to_string(System.unique_integer([:positive, :monotonic])),
      timestamp: timestamp(event),
      level: Atom.to_string(event.level),
      message: format_message(event)
    }

    Absinthe.Subscription.publish(ManavaultWeb.Endpoint, log_event, server_log: "server-logs")

    {:noreply, state}
  end

  @impl true
  def terminate(_reason, _state) do
    :logger.remove_handler(@handler_id)
    :ok
  end

  defp timestamp(%{meta: %{time: time}}) do
    time
    |> DateTime.from_unix!(:microsecond)
    |> DateTime.to_iso8601()
  end

  defp timestamp(_event), do: DateTime.utc_now() |> DateTime.to_iso8601()

  defp format_message(event) do
    event
    |> Logger.Formatter.format_event(@max_message_bytes)
    |> IO.chardata_to_string()
    |> String.replace(@ansi_escape, "")
    |> String.trim_trailing()
  rescue
    _error -> "Unable to format log event"
  end
end

defmodule Manavault.LogStream.Handler do
  @moduledoc false

  @behaviour :logger_handler

  @impl true
  def log(%{meta: %{pid: pid}}, %{config: %{receiver: receiver}}) when pid == receiver, do: :ok

  def log(event, %{config: %{receiver: receiver}}) do
    send(receiver, {:server_log, event})
    :ok
  end
end
