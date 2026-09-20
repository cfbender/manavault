defmodule ManavaultWeb.UserSocket do
  use Phoenix.Socket
  use Absinthe.Phoenix.Socket, schema: ManavaultWeb.Schema

  alias Manavault.Auth
  alias ManavaultWeb.Plugs.Authentication

  @impl true
  def connect(_params, socket, connect_info) do
    session = Map.get(connect_info, :session) || %{}

    if Auth.disabled?() || Authentication.session_authenticated?(session) do
      {:ok, socket}
    else
      :error
    end
  end

  @impl true
  def id(_socket), do: nil
end
