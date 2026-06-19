defmodule ManavaultWeb.AppControllerTest do
  use ManavaultWeb.ConnCase

  test "GET / serves the React mount", %{conn: conn} do
    conn = get(conn, ~p"/")

    assert html_response(conn, 200) =~ ~s(id="manavault-root")
  end

  test "GET /collection/locations/:id serves the React mount", %{conn: conn} do
    conn = get(conn, "/collection/locations/1")

    assert html_response(conn, 200) =~ ~s(id="manavault-root")
  end

  test "GET / uses built React assets for non-local dev hosts", %{conn: conn} do
    previous = Application.get_env(:manavault, :vite_dev_server?)
    Application.put_env(:manavault, :vite_dev_server?, true)

    on_exit(fn ->
      if is_nil(previous) do
        Application.delete_env(:manavault, :vite_dev_server?)
      else
        Application.put_env(:manavault, :vite_dev_server?, previous)
      end
    end)

    conn =
      conn
      |> Map.put(:host, "manavault.example.com")
      |> get(~p"/")

    response = html_response(conn, 200)

    assert response =~ ~s(src="/assets/react/app.js)
    refute response =~ "127.0.0.1:5173"
  end
end
