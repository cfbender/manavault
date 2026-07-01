defmodule ManavaultWeb.ClientIP do
  @moduledoc """
  Derives a stable client identifier for auth rate limiting.

  By default this is the peer IP (`conn.remote_ip`). When the app runs behind a
  trusted reverse proxy, every request's peer IP is the proxy's address, which
  collapses all clients into a single rate-limit bucket and can permanently lock
  out the legitimate owner once the shared address is banned.

  Set `config :manavault, :trust_proxy_headers, true`
  (env `MANAVAULT_TRUST_PROXY_HEADERS=true`) to instead trust the rightmost
  entry of the forwarded header (default `x-forwarded-for`, overridable via
  `MANAVAULT_FORWARDED_IP_HEADER`). A single trusted proxy appends the real
  client address as the last entry, so the rightmost value is the one that
  cannot be spoofed by the client. Only enable this when a proxy you control
  actually sets that header.
  """

  @unknown "unknown"
  @default_header "x-forwarded-for"

  @doc """
  Returns a client identifier string for the given connection.
  """
  @spec identifier(Plug.Conn.t()) :: String.t()
  def identifier(conn) do
    if trust_proxy_headers?() do
      forwarded_ip(conn) || peer_ip(conn)
    else
      peer_ip(conn)
    end
  end

  defp forwarded_ip(conn) do
    conn
    |> Plug.Conn.get_req_header(forwarded_header())
    |> Enum.join(",")
    |> String.split(",")
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == ""))
    |> List.last()
  end

  defp peer_ip(%{remote_ip: remote_ip}) when is_tuple(remote_ip) do
    remote_ip
    |> :inet.ntoa()
    |> to_string()
  end

  defp peer_ip(_conn), do: @unknown

  defp trust_proxy_headers? do
    Application.get_env(:manavault, :trust_proxy_headers, false)
  end

  defp forwarded_header do
    :manavault
    |> Application.get_env(:forwarded_ip_header, @default_header)
    |> to_string()
    |> String.downcase()
  end
end
