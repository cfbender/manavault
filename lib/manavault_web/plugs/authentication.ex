defmodule ManavaultWeb.Plugs.Authentication do
  @moduledoc false

  import Plug.Conn
  import Phoenix.Controller

  alias Manavault.Auth

  @session_key :manavault_authenticated

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
  end

  def sign_out(conn) do
    delete_session(conn, @session_key)
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

  def session_authenticated?(conn) do
    get_session(conn, @session_key) == true
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
