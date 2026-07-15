defmodule ManavaultWeb.Plugs.GraphQLCSRFProtection do
  @moduledoc false

  import Phoenix.Controller, only: [json: 2]
  import Plug.Conn

  alias Absinthe.Language.{Document, OperationDefinition}
  alias ManavaultWeb.Plugs.Authentication

  @csrf_session_key "_csrf_token"
  @csrf_header "x-csrf-token"
  @csrf_param "_csrf_token"
  @forbidden_response %{errors: [%{message: "Invalid CSRF token"}]}

  def init(opts), do: opts

  def call(conn, _opts) do
    if Authentication.session_authenticated?(conn) and mutation_request?(conn.params) and
         not valid_csrf_token?(conn) do
      conn
      |> put_status(:forbidden)
      |> json(@forbidden_response)
      |> halt()
    else
      conn
    end
  end

  defp mutation_request?(params) do
    params
    |> graphql_requests()
    |> Enum.any?(&mutation_operation?/1)
  end

  defp graphql_requests(%{"query" => query} = params) when is_binary(query), do: [params]

  defp graphql_requests(%{"_json" => requests}) when is_list(requests), do: requests

  defp graphql_requests(%{"operations" => operations}) when is_binary(operations) do
    case Jason.decode(operations) do
      {:ok, requests} when is_list(requests) -> requests
      {:ok, request} when is_map(request) -> [request]
      _ -> []
    end
  end

  defp graphql_requests(params) when is_map(params), do: [params]

  defp mutation_operation?(%{"query" => query} = request) when is_binary(query) do
    with {:ok, document} <- parse_document(query),
         %OperationDefinition{operation: :mutation} <- selected_operation(document, request) do
      true
    else
      _ -> false
    end
  end

  defp mutation_operation?(_request), do: false

  defp parse_document(query) do
    case Absinthe.Phase.Parse.run(query, []) do
      {:ok, %{input: %Document{} = document}} -> {:ok, document}
      _ -> :error
    end
  end

  defp selected_operation(document, request) do
    case operation_name(request) do
      nil -> single_operation(document)
      name -> Document.get_operation(document, name)
    end
  end

  defp operation_name(%{"operationName" => ""}), do: nil
  defp operation_name(%{"operationName" => name}) when is_binary(name), do: name
  defp operation_name(_request), do: nil

  defp single_operation(%Document{definitions: definitions}) do
    case Enum.filter(definitions, &match?(%OperationDefinition{}, &1)) do
      [operation] -> operation
      _ -> nil
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
