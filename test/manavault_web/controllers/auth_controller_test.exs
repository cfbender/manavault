defmodule ManavaultWeb.AuthControllerTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Auth
  alias Manavault.Auth.AttemptLimiter
  alias Manavault.Auth.ClientFailure
  alias Manavault.Repo
  @application_origin "https://manavault.test"


  setup do
    previous_hash = Application.get_env(:manavault, :admin_password_hash)
    previous_disabled = Application.get_env(:manavault, :auth_disabled)
    previous_rate_limit = Application.get_env(:manavault, :auth_rate_limit)

    AttemptLimiter.reset_all()

    on_exit(fn ->
      Application.put_env(:manavault, :admin_password_hash, previous_hash)
      Application.put_env(:manavault, :auth_disabled, previous_disabled)
      Application.put_env(:manavault, :auth_rate_limit, previous_rate_limit)
      AttemptLimiter.reset_all()
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

  test "login page renders only safe local return destinations", %{conn: conn} do
    configure_password("secret")

    Enum.each(return_to_cases(), fn {label, return_to, expected_destination} ->
      response =
        conn
        |> get("/login", %{"return_to" => return_to})
        |> html_response(200)

      assert rendered_return_to(response) == expected_destination,
             "GET login case #{label} rendered an unsafe destination"
    end)
  end

  test "successful login redirects only to safe local return destinations" do
    configure_password("secret")

    Enum.each(return_to_cases(), fn {label, return_to, expected_destination} ->
      conn = post(build_conn(), "/login", %{"password" => "secret", "return_to" => return_to})
      location = redirected_to(conn)

      assert location == expected_destination,
             "POST login case #{label} redirected to an unsafe destination"

      assert_same_application_origin(location)
    end)
  end


  test "login sets a persistent session cookie", %{conn: conn} do
    configure_password("secret")

    conn = post(conn, "/login", %{"password" => "secret", "return_to" => "/collection"})

    assert [cookie] = get_resp_header(conn, "set-cookie")
    assert cookie =~ "max-age=15552000"
  end

  test "login marks the session cookie secure when secure_cookies is enabled", %{conn: conn} do
    configure_password("secret")
    previous_secure = Application.get_env(:manavault, :secure_cookies)
    Application.put_env(:manavault, :secure_cookies, true)

    on_exit(fn ->
      if previous_secure == nil do
        Application.delete_env(:manavault, :secure_cookies)
      else
        Application.put_env(:manavault, :secure_cookies, previous_secure)
      end
    end)

    conn = post(conn, "/login", %{"password" => "secret", "return_to" => "/collection"})

    assert [cookie] = get_resp_header(conn, "set-cookie")
    assert cookie =~ "; secure"
  end

  test "login rejects an incorrect password", %{conn: conn} do
    configure_password("secret")

    conn = post(conn, "/login", %{"password" => "wrong", "return_to" => "/collection"})

    assert html_response(conn, 401) =~ "Incorrect password"
  end

  test "login rate-limits repeated incorrect password attempts", %{conn: conn} do
    configure_password("secret")
    configure_rate_limit(max_attempts_per_ip: 2)

    conn = post(conn, "/login", %{"password" => "wrong"})
    assert html_response(conn, 401) =~ "Incorrect password"

    conn =
      conn
      |> recycle()
      |> post("/login", %{"password" => "still wrong"})

    assert html_response(conn, 401) =~ "Incorrect password"

    conn =
      conn
      |> recycle()
      |> post("/login", %{"password" => "secret"})

    assert get_resp_header(conn, "retry-after") == ["60"]
    assert html_response(conn, 429) =~ "Too many incorrect password attempts"
  end

  test "login rate-limit has a global failed-attempt budget across clients" do
    configure_password("secret")
    configure_rate_limit(max_attempts_per_ip: 10, max_attempts_global: 2)

    first_conn =
      conn_from_ip({127, 0, 0, 1})
      |> post("/login", %{"password" => "wrong"})

    assert html_response(first_conn, 401) =~ "Incorrect password"

    second_conn =
      conn_from_ip({127, 0, 0, 2})
      |> post("/login", %{"password" => "still wrong"})

    assert html_response(second_conn, 401) =~ "Incorrect password"

    blocked_conn =
      conn_from_ip({127, 0, 0, 3})
      |> post("/login", %{"password" => "secret"})

    assert html_response(blocked_conn, 429) =~ "Too many incorrect password attempts"
  end

  test "login permanently bans a client after the configured failed-attempt count" do
    configure_password("secret")

    configure_rate_limit(
      max_attempts_per_ip: 10,
      max_attempts_global: 100,
      permanent_ban_after_failures: 3
    )

    conn_from_ip({127, 0, 0, 9})
    |> post("/login", %{"password" => "wrong"})
    |> html_response(401)

    conn_from_ip({127, 0, 0, 9})
    |> post("/login", %{"password" => "wrong again"})
    |> html_response(401)

    banned_conn =
      conn_from_ip({127, 0, 0, 9})
      |> post("/login", %{"password" => "still wrong"})

    assert html_response(banned_conn, 403) =~ "permanently blocked"

    assert %ClientFailure{banned_at: %DateTime{}} =
             Repo.get_by(ClientFailure, client_id: "127.0.0.9")

    blocked_conn =
      conn_from_ip({127, 0, 0, 9})
      |> post("/login", %{"password" => "secret"})

    assert html_response(blocked_conn, 403) =~ "permanently blocked"
  end

  test "successful login clears prior failed password attempts", %{conn: conn} do
    configure_password("secret")
    configure_rate_limit(max_attempts_per_ip: 2, permanent_ban_after_failures: 2)

    conn = post(conn, "/login", %{"password" => "wrong"})
    assert html_response(conn, 401) =~ "Incorrect password"

    conn =
      conn
      |> recycle()
      |> post("/login", %{"password" => "secret"})

    assert redirected_to(conn) == "/"

    conn =
      conn
      |> recycle()
      |> post("/login", %{"password" => "wrong"})

    assert html_response(conn, 401) =~ "Incorrect password"
  end

  test "private GraphQL returns JSON 401 when owner auth is configured", %{conn: conn} do
    configure_password("secret")

    conn = post(conn, "/api/graphql", %{"query" => "{ __typename }"})

    assert json_response(conn, 401) == %{"errors" => [%{"message" => "Authentication required"}]}
  end

  defp return_to_cases do
    [
      {"root path", "/", "/"},
      {"nested path", "/collection/decks", "/collection/decks"},
      {"path with query and fragment", "/collection/decks?view=grid#inventory",
       "/collection/decks?view=grid#inventory"},
      {"protocol-relative URL", "//evil.example/collection", "/"},
      {"absolute URL", "https://evil.example/collection", "/"},
      {"scheme-like URL", "javascript:alert(1)", "/"},
      {"userinfo authority", "//owner:secret@evil.example/collection", "/"},
      {"raw backslash authority", "/\\evil.example/collection", "/"},
      {"mixed slash and backslash authority", "/\\//evil.example/collection", "/"},
      {"percent-encoded backslash authority", "/%5Cevil.example/collection", "/"},
      {"double-encoded backslash authority", "/%255Cevil.example/collection", "/"},
      {"percent-encoded protocol-relative URL", "/%2F%2Fevil.example/collection", "/"},
      {"double-encoded protocol-relative URL", "/%252F%252Fevil.example/collection", "/"},
      {"percent-encoded mixed authority", "/%255C%252Fevil.example/collection", "/"},
      {"control characters", "/collection\r\nLocation: https://evil.example", "/"},
      {"truncated percent escape", "/collection%", "/"},
      {"invalid percent escape", "/collection%ZZ", "/"}
    ]
  end

  defp rendered_return_to(response) do
    [_, return_to] = Regex.run(~r/name="return_to" value="([^"]*)"/, response)
    return_to
  end

  defp assert_same_application_origin(location) do
    assert %URI{scheme: "https", host: "manavault.test", port: 443} =
             URI.merge(@application_origin, location)
  end

  defp configure_password(password) do
    Application.put_env(:manavault, :auth_disabled, false)

    Application.put_env(
      :manavault,
      :admin_password_hash,
      Auth.hash_password(password, iterations: 1)
    )
  end

  defp conn_from_ip(remote_ip) do
    build_conn()
    |> Map.put(:remote_ip, remote_ip)
  end

  defp configure_rate_limit(opts) do
    Application.put_env(
      :manavault,
      :auth_rate_limit,
      window_ms: Keyword.get(opts, :window_ms, 60_000),
      max_attempts_per_ip: Keyword.fetch!(opts, :max_attempts_per_ip),
      max_attempts_global: Keyword.get(opts, :max_attempts_global, 100),
      permanent_ban_after_failures: Keyword.get(opts, :permanent_ban_after_failures, 30)
    )
  end
end
