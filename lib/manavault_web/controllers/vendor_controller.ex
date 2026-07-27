defmodule ManavaultWeb.VendorController do
  use ManavaultWeb, :controller

  require Logger

  alias Manavault.Catalog.Vendors.StarCityGames

  def star_city_games(conn, %{"data" => decklist}) do
    case StarCityGames.create_deck_builder_url(decklist) do
      {:ok, url} ->
        redirect(conn, external: url)

      {:error, reason} ->
        Logger.warning("StarCityGames deck handoff failed: #{inspect(reason)}")
        send_resp(conn, :bad_gateway, "StarCityGames is unavailable. Please try again later.")
    end
  end

  def star_city_games(conn, _params) do
    send_resp(conn, :unprocessable_entity, "A decklist is required.")
  end
end
