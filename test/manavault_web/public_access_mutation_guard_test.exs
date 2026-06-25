defmodule ManavaultWeb.PublicAccessMutationGuardTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Auth

  @authenticated_graphql_paths ["/api/graphql"]
  @auth_required_response %{"errors" => [%{"message" => "Authentication required"}]}
  @never_accepted_argument "__publicAccessGuard__"

  setup do
    previous_hash = Application.get_env(:manavault, :admin_password_hash)
    previous_disabled = Application.get_env(:manavault, :auth_disabled)

    on_exit(fn ->
      Application.put_env(:manavault, :admin_password_hash, previous_hash)
      Application.put_env(:manavault, :auth_disabled, previous_disabled)
    end)

    :ok
  end

  test "public Absinthe routes expose no mutation fields" do
    public_routes = public_absinthe_routes()

    assert Enum.any?(public_routes, &(&1.path == "/share/graphql"))
    assert mutation_fields(ManavaultWeb.Schema) != []

    exposed_mutations =
      for %{path: path, schema: schema} <- public_routes,
          mutation_fields = mutation_fields(schema),
          mutation_fields != [] do
        %{path: path, schema: inspect(schema), mutation_fields: mutation_fields}
      end

    assert exposed_mutations == []
  end

  test "public share GraphQL rejects mutation operations", %{conn: conn} do
    conn = post(conn, "/share/graphql", %{"query" => "mutation { __typename }"})
    response = json_response(conn, 200)

    assert %{"errors" => [%{"message" => message} | _]} = response
    assert message =~ "Operation \"mutation\" not supported"
    refute Map.has_key?(response, "data")
  end

  test "private GraphQL mutations require authentication from public sessions" do
    configure_password("secret")

    for mutation <- mutation_fields(ManavaultWeb.Schema) do
      query = mutation_auth_guard_query(mutation)
      conn = post(build_conn(), "/api/graphql", %{"query" => query})
      response = Jason.decode!(conn.resp_body)

      assert conn.status == 401,
             "expected #{mutation} to be blocked by auth, got HTTP #{conn.status}: #{conn.resp_body}"

      assert response == @auth_required_response
    end
  end

  defp public_absinthe_routes do
    ManavaultWeb.Router
    |> Phoenix.Router.routes()
    |> Enum.filter(&(&1.plug == Absinthe.Plug))
    |> Enum.reject(&(&1.path in @authenticated_graphql_paths))
    |> Enum.map(fn route ->
      %{path: route.path, schema: Keyword.fetch!(route.plug_opts, :schema)}
    end)
  end

  defp mutation_fields(schema) do
    case Absinthe.Schema.lookup_type(schema, :mutation) do
      nil ->
        []

      %{fields: fields} ->
        fields
        |> Map.keys()
        |> Enum.reject(&(&1 == :__typename))
        |> Enum.sort()
    end
  end

  defp mutation_auth_guard_query(mutation) do
    "mutation { #{graphql_field_name(mutation)}(#{@never_accepted_argument}: true) { __typename } }"
  end

  defp graphql_field_name(field) do
    field
    |> Atom.to_string()
    |> Macro.camelize()
    |> lower_initial()
  end

  defp lower_initial(<<first::binary-size(1), rest::binary>>), do: String.downcase(first) <> rest

  defp configure_password(password) do
    Application.put_env(:manavault, :auth_disabled, false)

    Application.put_env(
      :manavault,
      :admin_password_hash,
      Auth.hash_password(password, iterations: 1)
    )
  end
end
