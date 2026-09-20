defmodule ManavaultWeb.Plugs.ContentSecurityPolicy do
  @moduledoc """
  Sets the `content-security-policy` header for browser responses.

  The policy is strict in production. When the Vite dev server is enabled the
  policy also allows the dev server origins, its websocket, and `'unsafe-eval'`
  for hot module reloading.
  """

  import Plug.Conn

  @dev_origins "http://localhost:5173 http://127.0.0.1:5173"

  def init(opts), do: opts

  def call(conn, _opts) do
    put_resp_header(conn, "content-security-policy", policy(vite_dev_server?()))
  end

  def policy(vite_dev? \\ vite_dev_server?()) do
    Enum.join(
      [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'self'",
        "form-action 'self'",
        script_src(vite_dev?),
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https://*.scryfall.io https://*.scryfall.com https://*.edhrec.com https://*.recommander.cards",
        "font-src 'self' data:",
        connect_src(vite_dev?),
        "worker-src 'self' blob:",
        "manifest-src 'self'",
        "media-src 'self' data: blob:"
      ],
      "; "
    )
  end

  defp script_src(true), do: "script-src 'self' 'unsafe-eval' #{@dev_origins}"
  defp script_src(false), do: "script-src 'self'"

  defp connect_src(true) do
    "connect-src 'self' https://api.github.com https://api.mtgstocks.com https://json-cloudflare.edhrec.com #{@dev_origins} ws://localhost:* ws://127.0.0.1:* wss:"
  end

  defp connect_src(false) do
    "connect-src 'self' https://api.github.com https://api.mtgstocks.com https://json-cloudflare.edhrec.com wss:"
  end

  defp vite_dev_server? do
    Application.get_env(:manavault, :vite_dev_server?, false) == true
  end
end
