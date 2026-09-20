defmodule ManavaultWeb.Plugs.ApiKeyAuthentication do
  @moduledoc false

  import Plug.Conn
  import Phoenix.Controller

  alias Manavault.Auth.ApiKeys
  alias Manavault.PublicShareRequestLimiter
  alias ManavaultWeb.ClientIP

  def init(opts), do: opts

  def call(conn, _opts) do
    with :ok <- PublicShareRequestLimiter.check(ClientIP.identifier(conn)),
         {:ok, token} <- bearer_token(conn),
         {:ok, api_key} <- ApiKeys.authenticate(token) do
      assign(conn, :api_key, api_key)
    else
      {:rate_limited, retry_after} ->
        conn
        |> put_resp_header("retry-after", Integer.to_string(retry_after))
        |> put_status(:too_many_requests)
        |> json(%{error: %{code: "rate_limited", message: "Too many API requests"}})
        |> halt()

      _ ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: %{code: "unauthorized", message: "A valid Bearer API key is required"}})
        |> halt()
    end
  end

  defp bearer_token(conn) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> token] when token != "" -> {:ok, token}
      _ -> :error
    end
  end
end
