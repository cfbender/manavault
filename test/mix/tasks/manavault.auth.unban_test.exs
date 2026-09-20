defmodule Mix.Tasks.Manavault.Auth.UnbanTest do
  use Manavault.DataCase

  alias Manavault.Auth.AttemptLimiter
  alias Manavault.Auth.ClientFailure

  setup do
    AttemptLimiter.reset_all()
    on_exit(&AttemptLimiter.reset_all/0)
    :ok
  end

  test "clears one client while preserving other bans and resets in-memory attempts" do
    previous_rate_limit = Application.get_env(:manavault, :auth_rate_limit)
    Application.put_env(:manavault, :auth_rate_limit, max_attempts_per_ip: 1)

    on_exit(fn ->
      Application.put_env(:manavault, :auth_rate_limit, previous_rate_limit)
    end)

    insert_failure!("203.0.113.10")
    insert_failure!("203.0.113.11")
    assert :banned = AttemptLimiter.record_failure("203.0.113.10")
    assert :permanently_banned = AttemptLimiter.check("203.0.113.10")

    Mix.Tasks.Manavault.Auth.Unban.run(["203.0.113.10"])

    refute Repo.get_by(ClientFailure, client_id: "203.0.113.10")
    assert Repo.get_by(ClientFailure, client_id: "203.0.113.11")
    assert :ok = AttemptLimiter.check("203.0.113.10")
  end

  test "clears every client even when the limiter is not running" do
    insert_failure!("203.0.113.10")
    insert_failure!("203.0.113.11")

    :ok = Supervisor.terminate_child(Manavault.Supervisor, AttemptLimiter)

    on_exit(fn ->
      case Supervisor.restart_child(Manavault.Supervisor, AttemptLimiter) do
        {:ok, _pid} -> :ok
        {:error, :running} -> :ok
      end
    end)

    Mix.Tasks.Manavault.Auth.Unban.run(["--all"])

    assert Repo.aggregate(ClientFailure, :count) == 0
  end

  defp insert_failure!(client_id) do
    %ClientFailure{}
    |> ClientFailure.changeset(%{
      client_id: client_id,
      failed_attempts: 30,
      banned_at: DateTime.utc_now() |> DateTime.truncate(:second)
    })
    |> Repo.insert!()
  end
end
