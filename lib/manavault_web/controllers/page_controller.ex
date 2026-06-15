defmodule ManavaultWeb.PageController do
  use ManavaultWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end
end
