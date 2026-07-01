defmodule ManavaultWeb.ClientIPTest do
  use ExUnit.Case, async: false

  import Plug.Test

  alias ManavaultWeb.ClientIP

  setup do
    previous_trust = Application.get_env(:manavault, :trust_proxy_headers)
    previous_header = Application.get_env(:manavault, :forwarded_ip_header)

    on_exit(fn ->
      restore(:trust_proxy_headers, previous_trust)
      restore(:forwarded_ip_header, previous_header)
    end)

    :ok
  end

  defp restore(key, nil), do: Application.delete_env(:manavault, key)
  defp restore(key, value), do: Application.put_env(:manavault, key, value)

  defp build_conn(remote_ip, forwarded \\ nil) do
    conn = %{conn(:post, "/login") | remote_ip: remote_ip}

    case forwarded do
      nil -> conn
      value -> Plug.Conn.put_req_header(conn, "x-forwarded-for", value)
    end
  end

  test "uses the peer IP by default and ignores forwarded headers" do
    Application.put_env(:manavault, :trust_proxy_headers, false)

    conn = build_conn({192, 168, 1, 10}, "203.0.113.7")

    assert ClientIP.identifier(conn) == "192.168.1.10"
  end

  test "uses the rightmost forwarded entry when proxy headers are trusted" do
    Application.put_env(:manavault, :trust_proxy_headers, true)

    conn = build_conn({10, 0, 0, 1}, "1.1.1.1, 203.0.113.7")

    assert ClientIP.identifier(conn) == "203.0.113.7"
  end

  test "falls back to the peer IP when trusted but no forwarded header is present" do
    Application.put_env(:manavault, :trust_proxy_headers, true)

    conn = build_conn({10, 0, 0, 1})

    assert ClientIP.identifier(conn) == "10.0.0.1"
  end

  test "ignores empty forwarded entries and trims whitespace" do
    Application.put_env(:manavault, :trust_proxy_headers, true)

    conn = build_conn({10, 0, 0, 1}, "203.0.113.7 ,   ")

    assert ClientIP.identifier(conn) == "203.0.113.7"
  end

  test "supports a custom forwarded header name" do
    Application.put_env(:manavault, :trust_proxy_headers, true)
    Application.put_env(:manavault, :forwarded_ip_header, "x-real-ip")

    conn =
      conn(:post, "/login")
      |> Map.put(:remote_ip, {10, 0, 0, 1})
      |> Plug.Conn.put_req_header("x-real-ip", "198.51.100.4")

    assert ClientIP.identifier(conn) == "198.51.100.4"
  end
end
