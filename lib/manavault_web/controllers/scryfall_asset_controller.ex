defmodule ManavaultWeb.ScryfallAssetController do
  use ManavaultWeb, :controller

  alias Manavault.ScryfallAssets

  def show(conn, %{"path" => path}) do
    case ScryfallAssets.local_path(path) do
      nil ->
        send_resp(conn, 404, "Not found")

      file_path ->
        conn
        |> put_resp_content_type("image/svg+xml")
        |> put_resp_header("cache-control", "public, max-age=86400")
        |> send_file(200, file_path)
    end
  end
end
