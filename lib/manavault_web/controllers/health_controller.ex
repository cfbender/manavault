defmodule ManavaultWeb.HealthController do
  use ManavaultWeb, :controller

  def show(conn, _params) do
    json(conn, %{status: "ok"})
  end
end
