defmodule ManavaultWeb.AuthControllerTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Auth

  setup do
    previous_hash = Application.get_env(:manavault, :admin_password_hash)
    previous_disabled = Application.get_env(:manavault, :auth_disabled)

    on_exit(fn ->
      Application.put_env(:manavault, :admin_password_hash, previous_hash)
      Application.put_env(:manavault, :auth_disabled, previous_disabled)
    end)

    :ok
  end

  test "private browser routes require auth by default when no opt-out is set", %{conn: conn} do
    Application.put_env(:manavault, :auth_disabled, false)
    Application.put_env(:manavault, :admin_password_hash, nil)

    conn = get(conn, "/collection")

    assert redirected_to(conn) == "/login?return_to=%2Fcollection"
  end

  test "login page reports missing hash when auth is enabled by default", %{conn: conn} do
    Application.put_env(:manavault, :auth_disabled, false)
    Application.put_env(:manavault, :admin_password_hash, nil)

    conn = get(conn, "/login")

    assert html_response(conn, 503) =~ "MANAVAULT_ADMIN_PASSWORD_HASH"
  end

  test "private browser routes allow opt-out auth", %{conn: conn} do
    Application.put_env(:manavault, :auth_disabled, true)
    Application.put_env(:manavault, :admin_password_hash, nil)

    conn = get(conn, "/collection")

    assert html_response(conn, 200) =~ ~s(id="manavault-root")
  end

  test "private browser routes redirect to login when owner auth is configured", %{conn: conn} do
    configure_password("secret")

    conn = get(conn, "/collection")

    assert redirected_to(conn) == "/login?return_to=%2Fcollection"
  end

  test "login page uses ManaVault home branding", %{conn: conn} do
    configure_password("secret")

    conn = get(conn, "/login")
    response = html_response(conn, 200)

    assert response =~ ~s(src="/images/logo.svg")
    assert response =~ "Your Magic vault, secured."
    assert response =~ "Owner access"
  end

  test "share browser routes stay public when owner auth is configured", %{conn: conn} do
    configure_password("secret")

    conn = get(conn, "/share/decks/token")

    assert html_response(conn, 200) =~ ~s(id="manavault-root")
  end

  test "login creates a session for private browser routes", %{conn: conn} do
    configure_password("secret")

    conn = post(conn, "/login", %{"password" => "secret", "return_to" => "/collection"})

    assert redirected_to(conn) == "/collection"

    conn =
      conn
      |> recycle()
      |> get("/collection")

    assert html_response(conn, 200) =~ ~s(id="manavault-root")
  end

  test "login rejects an incorrect password", %{conn: conn} do
    configure_password("secret")

    conn = post(conn, "/login", %{"password" => "wrong", "return_to" => "/collection"})

    assert html_response(conn, 401) =~ "Incorrect password"
  end

  test "private GraphQL returns JSON 401 when owner auth is configured", %{conn: conn} do
    configure_password("secret")

    conn = post(conn, "/api/graphql", %{"query" => "{ __typename }"})

    assert json_response(conn, 401) == %{"errors" => [%{"message" => "Authentication required"}]}
  end

  defp configure_password(password) do
    Application.put_env(:manavault, :auth_disabled, false)

    Application.put_env(
      :manavault,
      :admin_password_hash,
      Auth.hash_password(password, iterations: 1)
    )
  end
end
