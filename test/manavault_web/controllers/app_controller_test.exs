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
end
