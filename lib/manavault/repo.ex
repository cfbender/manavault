defmodule Manavault.Repo do
  use Ecto.Repo,
    otp_app: :manavault,
    adapter: Ecto.Adapters.SQLite3

  require Logger

  @busy_retry_delays [1_000, 2_000, 5_000, 10_000, 20_000]

  @doc """
  Runs `fun`, retrying with increasing delays when SQLite reports the database
  busy. SQLite allows one writer at a time and `busy_timeout` waits at most 15
  seconds, so background bulk writers that overlap another long write (such as
  a catalog import) should wait rather than fail. Each retry is logged under
  `context`; the last failure is re-raised.
  """
  def retry_when_busy(fun, context, delays \\ @busy_retry_delays) when is_function(fun, 0) do
    fun.()
  rescue
    error in Exqlite.Error ->
      case {error, delays} do
        {%Exqlite.Error{message: "Database busy"}, [delay | remaining]} ->
          Logger.warning("#{context} hit a busy database; retrying in #{delay}ms")
          Process.sleep(delay)
          retry_when_busy(fun, context, remaining)

        _not_retryable ->
          reraise error, __STACKTRACE__
      end
  end
end
