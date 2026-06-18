defmodule ManavaultWeb.AppController do
  use ManavaultWeb, :controller

  def index(conn, _params) do
    render(conn, :index, page_title: "ManaVault")
  end
end
