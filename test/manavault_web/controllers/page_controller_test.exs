defmodule ManavaultWeb.PageControllerTest do
  use ManavaultWeb.ConnCase

  test "GET / renders app home screen", %{conn: conn} do
    conn = get(conn, ~p"/")
    html = html_response(conn, 200)

    assert html =~ "Your Magic collection, organized."
    assert html =~ "Collection"
    assert html =~ "Decks"
    assert html =~ "Search cards"
    assert html =~ ~s|action="/cards"|
    assert html =~ ~s|name="q"|
  end
end
