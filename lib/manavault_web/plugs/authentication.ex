defmodule ManavaultWeb.Plugs.Authentication do
  @moduledoc false

  import Plug.Conn
  import Phoenix.Controller

  alias Manavault.Auth

  @session_key :manavault_authenticated
  @fingerprint_key :manavault_auth_fingerprint

  def init(mode), do: mode

  def call(conn, :browser), do: require_browser_authentication(conn)
  def call(conn, :api), do: require_api_authentication(conn)

  def authenticated?(conn) do
    Auth.disabled?() || session_authenticated?(conn)
  end

  def sign_in(conn) do
    conn
    |> configure_session(renew: true)
    |> clear_session()
    |> put_session(@session_key, true)
    |> put_session(@fingerprint_key, Auth.admin_password_fingerprint())
  end

  def sign_out(conn) do
    configure_session(conn, drop: true)
  end

  defp require_browser_authentication(conn) do
    if authenticated?(conn) do
      conn
    else
      conn
      |> redirect(to: login_path(conn))
      |> halt()
    end
  end

  defp require_api_authentication(conn) do
    if authenticated?(conn) do
      conn
    else
      conn
      |> put_status(:unauthorized)
      |> json(%{errors: [%{message: "Authentication required"}]})
      |> halt()
    end
  end

  def session_authenticated?(%Plug.Conn{} = conn) do
    session_authenticated?(%{
      @session_key => get_session(conn, @session_key),
      @fingerprint_key => get_session(conn, @fingerprint_key)
    })
  end

  def session_authenticated?(session) when is_map(session) do
    fingerprint = session_value(session, @fingerprint_key)
    current_fingerprint = Auth.admin_password_fingerprint()

    session_value(session, @session_key) == true and
      is_binary(fingerprint) and
      is_binary(current_fingerprint) and
      byte_size(fingerprint) == byte_size(current_fingerprint) and
      Plug.Crypto.secure_compare(fingerprint, current_fingerprint)
  end

  def session_authenticated?(_session), do: false

  defp session_value(session, key) do
    Map.get(session, key, Map.get(session, Atom.to_string(key)))
  end

  defp login_path(conn) do
    return_to = current_path(conn)

    if return_to == "/" do
      "/login"
    else
      "/login?" <> URI.encode_query(return_to: return_to)
    end
  end
end
