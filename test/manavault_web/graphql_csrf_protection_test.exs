defmodule ManavaultWeb.GraphQLCSRFProtectionTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Auth
  alias Manavault.Catalog.Deck
  alias Manavault.Repo

  @mutation """
  mutation CreateCsrfDeck {
    createDeck(input: {name: "CSRF protected deck"}) {
      deck {
        id
        name
      }
    }
  }
  """
  @query """
  query HomeSummary {
    homeSummary {
      collectionCount
      locationCount
      deckCount
    }
  }
  """
  @forbidden_response %{"errors" => [%{"message" => "Invalid CSRF token"}]}

  setup do
    previous_hash = Application.get_env(:manavault, :admin_password_hash)
    previous_disabled = Application.get_env(:manavault, :auth_disabled)

    Application.put_env(:manavault, :auth_disabled, false)

    Application.put_env(
      :manavault,
      :admin_password_hash,
      Auth.hash_password("secret", iterations: 1)
    )

    on_exit(fn ->
      Application.put_env(:manavault, :admin_password_hash, previous_hash)
      Application.put_env(:manavault, :auth_disabled, previous_disabled)
    end)

    :ok
  end

  test "session-authenticated queries remain functional without a CSRF token" do
    {conn, _csrf_token} = authenticated_conn()

    conn =
      post_json(conn, %{
        "query" => @query <> "\n" <> @mutation,
        "operationName" => "HomeSummary"
      })

    assert %{
             "data" => %{
               "homeSummary" => %{
                 "collectionCount" => 0,
                 "locationCount" => 0,
                 "deckCount" => 0
               }
             }
           } = json_response(conn, 200)

    assert deck_count() == 0
  end

  test "missing and forged JSON tokens reject mutations before their resolver runs" do
    {conn, csrf_token} = authenticated_conn()

    missing_token = post_json(conn, %{"query" => @mutation})
    assert_forbidden(missing_token)
    assert deck_count() == 0

    forged_token = post_json(conn, %{"query" => @mutation}, "forged-token")
    assert_forbidden(forged_token)
    assert deck_count() == 0

    valid_token = post_json(conn, %{"query" => @mutation}, csrf_token)

    assert %{
             "data" => %{
               "createDeck" => %{
                 "deck" => %{"name" => "CSRF protected deck"}
               }
             }
           } = json_response(valid_token, 200)

    assert deck_count() == 1
  end

  test "JSON, URL-encoded, multipart, and raw GraphQL bodies cannot bypass CSRF" do
    {conn, csrf_token} = authenticated_conn()

    json_missing_token = post_json(conn, %{"query" => @mutation})
    assert_forbidden(json_missing_token)

    urlencoded_missing_token = post_urlencoded(conn, %{"query" => @mutation})
    assert_forbidden(urlencoded_missing_token)

    multipart_missing_token = post_multipart(conn, %{"query" => @mutation})
    assert_forbidden(multipart_missing_token)

    multipart_operations_missing_token =
      post_multipart(conn, %{"operations" => Jason.encode!(%{"query" => @mutation})})

    assert_forbidden(multipart_operations_missing_token)

    raw_graphql_missing_token = post_raw_graphql(conn, @mutation)
    assert_forbidden(raw_graphql_missing_token)

    assert deck_count() == 0

    json_valid_token =
      post_json(conn, %{"query" => @mutation, "_csrf_token" => csrf_token})

    assert %{"data" => %{"createDeck" => %{"deck" => %{"id" => _}}}} =
             json_response(json_valid_token, 200)

    urlencoded_valid_token =
      post_urlencoded(conn, %{"query" => @mutation, "_csrf_token" => csrf_token})

    assert %{"data" => %{"createDeck" => %{"deck" => %{"id" => _}}}} =
             json_response(urlencoded_valid_token, 200)

    multipart_valid_token =
      post_multipart(conn, %{"query" => @mutation, "_csrf_token" => csrf_token})

    assert %{"data" => %{"createDeck" => %{"deck" => %{"id" => _}}}} =
             json_response(multipart_valid_token, 200)

    assert deck_count() == 3
  end

  test "a CSRF token from the prior session is rejected after authentication rotates the session" do
    {conn, stale_token} = authenticated_conn()

    rotated_conn =
      conn
      |> recycle()
      |> post("/login", %{
        "password" => "secret",
        "return_to" => "/collection",
        "_csrf_token" => stale_token
      })

    assert redirected_to(rotated_conn) == "/collection"

    current_conn = rotated_conn |> recycle() |> get("/collection")
    current_token = csrf_token(current_conn)

    stale_request = post_json(current_conn, %{"query" => @mutation}, stale_token)
    assert_forbidden(stale_request)
    assert deck_count() == 0

    current_request = post_json(current_conn, %{"query" => @mutation}, current_token)

    assert %{"data" => %{"createDeck" => %{"deck" => %{"id" => _}}}} =
             json_response(current_request, 200)

    assert deck_count() == 1
  end

  test "public share GraphQL remains token-free and outside the authenticated CSRF boundary" do
    conn =
      post_json(build_conn(), "/share/graphql", %{
        "query" => "query { deck(id: \"missing\") { id } }"
      })

    assert %{"data" => %{"deck" => nil}} = json_response(conn, 200)
  end

  defp authenticated_conn do
    conn =
      build_conn()
      |> post("/login", %{"password" => "secret", "return_to" => "/collection"})
      |> recycle()
      |> get("/collection")

    {conn, csrf_token(conn)}
  end

  defp post_json(conn, payload, csrf_token \\ nil)

  defp post_json(conn, path, payload) when is_binary(path) do
    conn
    |> recycle()
    |> put_req_header("content-type", "application/json")
    |> post(path, Jason.encode!(payload))
  end

  defp post_json(conn, payload, csrf_token) do
    conn =
      conn
      |> recycle()
      |> put_req_header("content-type", "application/json")

    conn =
      if csrf_token do
        put_req_header(conn, "x-csrf-token", csrf_token)
      else
        conn
      end

    post(conn, "/api/graphql", Jason.encode!(payload))
  end

  defp post_urlencoded(conn, fields) do
    conn
    |> recycle()
    |> put_req_header("content-type", "application/x-www-form-urlencoded")
    |> post("/api/graphql", URI.encode_query(fields))
  end

  defp post_multipart(conn, fields) do
    boundary = "manavault-csrf-boundary"

    body =
      fields
      |> Enum.map_join("", fn {name, value} ->
        "--#{boundary}\r\ncontent-disposition: form-data; name=\"#{name}\"\r\n\r\n#{value}\r\n"
      end)
      |> Kernel.<>("--#{boundary}--\r\n")

    conn
    |> recycle()
    |> put_req_header("content-type", "multipart/form-data; boundary=#{boundary}")
    |> post("/api/graphql", body)
  end

  defp post_raw_graphql(conn, query) do
    conn
    |> recycle()
    |> put_req_header("content-type", "application/graphql")
    |> post("/api/graphql", query)
  end

  defp csrf_token(conn) do
    response = html_response(conn, 200)
    [_, csrf_token] = Regex.run(~r/<meta name="csrf-token" content="([^"]+)"/, response)
    csrf_token
  end

  defp assert_forbidden(conn) do
    assert json_response(conn, 403) == @forbidden_response
  end

  defp deck_count do
    Repo.aggregate(Deck, :count, :id)
  end
end
