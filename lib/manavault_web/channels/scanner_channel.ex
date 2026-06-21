defmodule ManavaultWeb.ScannerChannel do
  use ManavaultWeb, :channel

  alias Manavault.Catalog
  alias ManavaultWeb.ScanCapture

  @impl true
  def join("scanner:" <> scan_session_id, _payload, socket) do
    Phoenix.PubSub.subscribe(Manavault.PubSub, "scanner_updates:#{scan_session_id}")
    {:ok, assign(socket, :scan_session_id, scan_session_id)}
  end

  @impl true
  def handle_in("capture", payload, socket) do
    args =
      payload
      |> Map.new(fn {key, value} -> {snake_key(key), value} end)
      |> Map.put("scan_session_id", socket.assigns.scan_session_id)

    case ScanCapture.capture(args, response: :compact, recent_limit: 12) do
      {:ok, result} ->
        {:reply, {:ok, ScanCapture.to_client_map(result)}, socket}

      {:error, message} ->
        {:reply, {:error, %{message: message}}, socket}
    end
  end

  @impl true
  def handle_info({:scan_session_updated, scan_session_id}, socket) do
    if to_string(scan_session_id) == to_string(socket.assigns.scan_session_id) do
      scan_session = Catalog.get_scan_session_capture_summary!(scan_session_id, recent_limit: 12)

      push(socket, "scan_session_updated", %{
        "scanSession" => ScanCapture.scan_session_to_client_map(scan_session)
      })
    end

    {:noreply, socket}
  end

  defp snake_key(key) when is_atom(key), do: key |> Atom.to_string() |> snake_key()
  defp snake_key("imageData"), do: "image_data"
  defp snake_key("lastOracleId"), do: "last_oracle_id"
  defp snake_key("preferFoil"), do: "prefer_foil"
  defp snake_key("setCodes"), do: "set_codes"
  defp snake_key(key), do: key
end
