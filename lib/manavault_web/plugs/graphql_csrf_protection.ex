defmodule ManavaultWeb.Plugs.GraphQLCSRFProtection do
  @moduledoc false

  import Phoenix.Controller, only: [json: 2]
  import Plug.Conn

  alias ManavaultWeb.Plugs.Authentication

  @csrf_session_key "_csrf_token"
  @csrf_header "x-csrf-token"
  @csrf_param "_csrf_token"
  @forbidden_response %{errors: [%{message: "Invalid CSRF token"}]}
  @method_not_allowed_response %{errors: [%{message: "Method not allowed"}]}

  def init(opts), do: opts

  def call(conn, _opts) do
    cond do
      conn.method != "POST" ->
        conn
        |> put_resp_header("allow", "POST")
        |> put_status(:method_not_allowed)
        |> json(@method_not_allowed_response)
        |> halt()

      Authentication.session_authenticated?(conn) and not valid_csrf_token?(conn) ->
        conn
        |> put_status(:forbidden)
        |> json(@forbidden_response)
        |> halt()

      true ->
        conn
    end
  end

  defp valid_csrf_token?(conn) do
    state =
      conn |> get_session(@csrf_session_key) |> Plug.CSRFProtection.dump_state_from_session()

    Enum.any?(request_csrf_tokens(conn), fn token ->
      Plug.CSRFProtection.valid_state_and_csrf_token?(state, token)
    end)
  end

  defp request_csrf_tokens(conn) do
    body_token = Map.get(conn.params, @csrf_param)
    header_tokens = get_req_header(conn, @csrf_header)

    [body_token | header_tokens]
    |> Enum.filter(&is_binary/1)
  end
end
