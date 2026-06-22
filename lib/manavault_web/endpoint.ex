defmodule ManavaultWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :manavault

  # The session will be stored in the cookie and signed,
  # this means its contents can be read but not tampered with.
  # Set :encryption_salt if you would also like to encrypt it.
  @session_options [
    store: :cookie,
    key: "_manavault_key",
    signing_salt: "HGc1xdq0",
    same_site: "Lax"
  ]

  @fresh_asset_cache_control "no-cache, no-store, must-revalidate"
  @fresh_asset_headers %{"pragma" => "no-cache", "expires" => "0"}

  # Vite module entries and dynamic chunks must revalidate at the browser/CDN
  # boundary. Old entry modules can point at deleted chunks after deploys.
  plug Plug.Static,
    at: "/assets/react",
    from: {:manavault, "priv/static/assets/react"},
    gzip: not code_reloading?,
    cache_control_for_etags: @fresh_asset_cache_control,
    cache_control_for_vsn_requests: @fresh_asset_cache_control,
    headers: @fresh_asset_headers

  # Compatibility alias for cached Vite entries that request chunks from
  # /assets/*.js instead of /assets/react/assets/*.js.
  plug Plug.Static,
    at: "/assets",
    from: {:manavault, "priv/static/assets/react/assets"},
    gzip: not code_reloading?,
    cache_control_for_etags: @fresh_asset_cache_control,
    cache_control_for_vsn_requests: @fresh_asset_cache_control,
    headers: @fresh_asset_headers

  plug Plug.Static,
    at: "/",
    from: :manavault,
    gzip: not code_reloading?,
    only: ManavaultWeb.static_paths(),
    raise_on_missing_only: code_reloading?

  # Code reloading can be explicitly enabled under the
  # :code_reloader configuration of your endpoint.
  if code_reloading? do
    socket "/phoenix/live_reload/socket", Phoenix.LiveReloader.Socket
    plug Phoenix.LiveReloader
    plug Phoenix.CodeReloader
    plug Phoenix.Ecto.CheckRepoStatus, otp_app: :manavault
  end

  plug Plug.RequestId
  plug Plug.Telemetry, event_prefix: [:phoenix, :endpoint]

  plug Plug.Parsers,
    parsers: [:urlencoded, :multipart, :json],
    pass: ["*/*"],
    json_decoder: Phoenix.json_library()

  plug Plug.MethodOverride
  plug Plug.Head
  plug Plug.Session, @session_options
  plug ManavaultWeb.Router
end
