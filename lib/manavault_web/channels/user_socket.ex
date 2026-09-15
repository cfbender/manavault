defmodule ManavaultWeb.UserSocket do
  use Phoenix.Socket
  use Absinthe.Phoenix.Socket, schema: ManavaultWeb.Schema

  alias Manavault.Auth

  @authenticated_session_key "manavault_authenticated"

  @impl true
  def connect(_params, socket, connect_info) do
    session = Map.get(connect_info, :session) || %{}

    if Auth.disabled?() || Map.get(session, @authenticated_session_key) == true do
      {:ok, socket}
    else
      :error
    end
  end

  @impl true
  def id(_socket), do: nil
end
