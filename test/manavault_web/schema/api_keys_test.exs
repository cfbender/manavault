defmodule ManavaultWeb.Schema.ApiKeysTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Auth.ApiKeys

  test "creates, lists, and revokes a personal API key", %{conn: conn} do
    created =
      conn
      |> post("/api/graphql", %{
        "query" => """
        mutation CreateApiKey($name: String!) {
          createApiKey(name: $name) {
            token
            apiKey { id name prefix createdAt lastUsedAt }
          }
        }
        """,
        "variables" => %{"name" => "The Gathering"}
      })
      |> json_response(200)

    assert %{
             "data" => %{
               "createApiKey" => %{
                 "token" => token,
                 "apiKey" => %{
                   "id" => id,
                   "name" => "The Gathering",
                   "prefix" => prefix,
                   "createdAt" => created_at,
                   "lastUsedAt" => nil
                 }
               }
             }
           } = created

    assert prefix == String.slice(token, 0, 12)
    assert is_binary(created_at)
    assert {:ok, _} = ApiKeys.authenticate(token)

    listed =
      conn
      |> recycle()
      |> post("/api/graphql", %{
        "query" => "query { apiKeys { id name prefix createdAt lastUsedAt } }"
      })
      |> json_response(200)

    assert %{
             "data" => %{
               "apiKeys" => [
                 %{"id" => ^id, "name" => "The Gathering", "lastUsedAt" => last_used_at}
               ]
             }
           } = listed

    assert is_binary(last_used_at)

    revoked =
      conn
      |> recycle()
      |> post("/api/graphql", %{
        "query" => "mutation RevokeApiKey($id: ID!) { revokeApiKey(id: $id) { id } }",
        "variables" => %{"id" => id}
      })
      |> json_response(200)

    assert %{"data" => %{"revokeApiKey" => %{"id" => ^id}}} = revoked
    assert :error = ApiKeys.authenticate(token)
  end
end
