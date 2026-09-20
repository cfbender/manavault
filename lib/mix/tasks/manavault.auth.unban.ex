defmodule Mix.Tasks.Manavault.Auth.Unban do
  @moduledoc """
  Clears permanent login bans.

      mix manavault.auth.unban CLIENT_ID
      mix manavault.auth.unban --all
  """

  use Mix.Task

  @shortdoc "Clears permanent login bans"

  @impl Mix.Task
  def run(args) do
    Mix.Task.run("app.start")

    case OptionParser.parse(args, strict: [all: :boolean]) do
      {[all: true], [], []} ->
        :ok = Manavault.Auth.AttemptLimiter.reset_all()
        Mix.shell().info("Cleared all login bans")

      {[], [client_id], []} ->
        :ok = Manavault.Auth.AttemptLimiter.reset(client_id)
        Mix.shell().info("Cleared login ban for #{client_id}")

      _other ->
        Mix.raise("Usage: mix manavault.auth.unban CLIENT_ID | --all")
    end
  end
end
