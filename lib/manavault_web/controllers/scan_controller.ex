defmodule ManavaultWeb.ScanController do
  use ManavaultWeb, :controller

  alias Manavault.Catalog

  def index(conn, _params) do
    case Catalog.list_scan_sessions() do
      [] ->
        {:ok, scan_session} =
          Catalog.create_scan_session(%{"name" => Catalog.generated_scan_session_name()})

        redirect(conn, to: ~p"/scan-sessions/#{scan_session.id}/scanner")

      _scan_sessions ->
        redirect(conn, to: ~p"/scan-sessions")
    end
  end
end
