defmodule ManavaultWeb.AuthController do
  use ManavaultWeb, :controller

  alias Manavault.Auth
  alias Manavault.Auth.AttemptLimiter
  alias ManavaultWeb.AuthReturnPath
  alias ManavaultWeb.Plugs.Authentication

  def new(conn, params) do
    cond do
      Auth.disabled?() ->
        redirect(conn, to: AuthReturnPath.sanitize(params["return_to"]))

      Authentication.authenticated?(conn) ->
        redirect(conn, to: AuthReturnPath.sanitize(params["return_to"]))

      !Auth.configured?() ->
        render_login(conn, 503, params["return_to"], missing_hash_message())

      true ->
        render_login(conn, 200, params["return_to"], nil)
    end
  end

  def create(conn, %{"password" => password} = params) do
    return_to = AuthReturnPath.sanitize(params["return_to"])

    cond do
      Auth.disabled?() ->
        redirect(conn, to: return_to)

      !Auth.configured?() ->
        render_login(conn, 503, return_to, missing_hash_message())

      true ->
        handle_password_login(conn, password, return_to)
    end
  end

  def create(conn, params) do
    render_login(conn, 400, params["return_to"], "Password is required")
  end

  def delete(conn, _params) do
    conn
    |> Authentication.sign_out()
    |> redirect(to: "/login")
  end

  defp handle_password_login(conn, password, return_to) do
    client_id = client_id(conn)

    case AttemptLimiter.check(client_id) do
      :permanently_banned ->
        permanently_banned_response(conn, return_to)

      {:rate_limited, retry_after} ->
        rate_limited_response(conn, return_to, retry_after)

      :ok ->
        verify_password_login(conn, password, return_to, client_id)
    end
  end

  defp verify_password_login(conn, password, return_to, client_id) do
    if Auth.verify_admin_password(password) do
      AttemptLimiter.reset(client_id)

      conn
      |> Authentication.sign_in()
      |> redirect(to: return_to)
    else
      case AttemptLimiter.record_failure(client_id) do
        :banned -> permanently_banned_response(conn, return_to)
        :ok -> incorrect_password_response(conn, return_to)
      end
    end
  end

  defp incorrect_password_response(conn, return_to) do
    render_login(conn, 401, return_to, "Incorrect password")
  end

  defp permanently_banned_response(conn, return_to) do
    render_login(conn, 403, return_to, permanently_banned_message())
  end

  defp permanently_banned_message do
    "Too many incorrect password attempts. This client is permanently blocked."
  end

  defp rate_limited_response(conn, return_to, retry_after) do
    conn
    |> put_resp_header("retry-after", Integer.to_string(retry_after))
    |> render_login(429, return_to, rate_limited_message(retry_after))
  end

  defp rate_limited_message(retry_after) when retry_after < 120 do
    "Too many incorrect password attempts. Try again in #{retry_after} seconds."
  end

  defp rate_limited_message(retry_after) do
    minutes = retry_after |> Kernel./(60) |> ceil()
    "Too many incorrect password attempts. Try again in #{minutes} minutes."
  end

  defp client_id(conn), do: ManavaultWeb.ClientIP.identifier(conn)

  defp missing_hash_message do
    "Admin password hash is missing. Set MANAVAULT_ADMIN_PASSWORD_HASH or explicitly disable auth with MANAVAULT_AUTH_DISABLED=true."
  end

  defp render_login(conn, status, return_to, error) do
    conn
    |> put_status(status)
    |> render(:login,
      layout: false,
      csrf_token: get_csrf_token(),
      return_to: AuthReturnPath.sanitize(return_to),
      error: error
    )
  end
end
