defmodule Manavault.Backup.PendingRestore do
  @moduledoc false

  require Logger

  def child_spec(opts) do
    %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [opts]},
      type: :worker
    }
  end

  def start_link(opts) do
    case Manavault.Backup.Cloud.apply_pending_restore(opts) do
      {:ok, path} -> Logger.info("applied staged cloud restore from #{path}")
      :ok -> :ok
    end

    :ignore
  end
end
