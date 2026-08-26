defmodule ManavaultWeb.ServerLogsTest do
  use ExUnit.Case, async: false
  use Absinthe.Phoenix.SubscriptionTest, schema: ManavaultWeb.Schema

  import Phoenix.ChannelTest

  require Logger

  alias ManavaultWeb.UserSocket

  @endpoint ManavaultWeb.Endpoint

  test "logger events are delivered through the GraphQL subscription" do
    {:ok, socket} =
      UserSocket
      |> socket(nil, %{})
      |> join_absinthe()

    ref =
      push_doc(socket, """
      subscription {
        serverLog {
          timestamp
          level
          message
        }
      }
      """)

    assert_reply ref, :ok, %{subscriptionId: _subscription_id}

    message = "server log subscription test #{System.unique_integer([:positive])}"
    Logger.warning([IO.ANSI.yellow(), message, IO.ANSI.reset()])

    assert_push "subscription:data",
                %{
                  result: %{
                    data: %{
                      "serverLog" => %{
                        "timestamp" => timestamp,
                        "level" => "warning",
                        "message" => ^message
                      }
                    }
                  }
                },
                1_000

    assert {:ok, _date_time, 0} = DateTime.from_iso8601(timestamp)
  end

  test "socket rejects unauthenticated connections when authentication is enabled" do
    previous = Application.get_env(:manavault, :auth_disabled)
    Application.put_env(:manavault, :auth_disabled, false)

    on_exit(fn -> Application.put_env(:manavault, :auth_disabled, previous) end)

    socket = %Phoenix.Socket{}

    assert :error = UserSocket.connect(%{}, socket, %{session: %{}})

    assert {:ok, ^socket} =
             UserSocket.connect(%{}, socket, %{
               session: %{"manavault_authenticated" => true}
             })
  end
end
