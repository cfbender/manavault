defmodule ManavaultWeb.SessionOptions do
  @moduledoc """
  Builds the signed session cookie options at runtime.

  The `:secure` flag and lifetime must be decided per deployment (the same
  release image serves both plain-HTTP LAN installs and HTTPS installs behind a
  TLS-terminating proxy), so they are read from application config at request
  time rather than baked in at compile time.

  * `secure_cookies` (env `MANAVAULT_SECURE_COOKIES=true`) — when set, the
    session cookie is marked `Secure` so browsers never send it over plaintext
    HTTP. Enable it whenever the instance is reached over HTTPS. Defaults to
    off to avoid breaking HTTP-only self-hosted installs.
  * `session_max_age_days` (env `MANAVAULT_SESSION_MAX_AGE_DAYS`) — session
    lifetime in days. Defaults to 180.

  HTTP→HTTPS redirection and HSTS belong on the reverse proxy that terminates
  TLS in this architecture, so they are intentionally not handled here.
  """

  @default_max_age_days 180

  @base [
    store: :cookie,
    key: "_manavault_key",
    signing_salt: "HGc1xdq0",
    same_site: "Lax"
  ]

  @doc "Returns the `Plug.Session` options resolved from current config."
  @spec build() :: keyword()
  def build do
    @base
    |> Keyword.put(:max_age, max_age_seconds())
    |> maybe_put_secure()
  end

  defp maybe_put_secure(opts) do
    if Application.get_env(:manavault, :secure_cookies, false) do
      Keyword.put(opts, :secure, true)
    else
      opts
    end
  end

  defp max_age_seconds do
    days = Application.get_env(:manavault, :session_max_age_days, @default_max_age_days)
    days * 24 * 60 * 60
  end
end
