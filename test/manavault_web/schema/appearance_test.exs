defmodule ManavaultWeb.Schema.AppearanceTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Appearance

  test "appearance settings query returns the defaults", %{conn: conn} do
    conn =
      post(conn, "/api/graphql", %{
        "query" => "{ appearanceSettings { palette themeStyle } }"
      })

    assert json_response(conn, 200) == %{
             "data" => %{
               "appearanceSettings" => %{"palette" => "claret", "themeStyle" => "glass"}
             }
           }
  end

  test "update mutation persists only the provided fields", %{conn: conn} do
    assert %{"palette" => "gruvbox", "themeStyle" => "glass"} =
             update_appearance(conn, ~s|palette: "gruvbox"|)

    assert %{"palette" => "gruvbox", "themeStyle" => "classic"} =
             update_appearance(recycle(conn), ~s|themeStyle: "classic"|)

    assert %{palette: "gruvbox", theme_style: "classic"} = Appearance.settings()
  end

  test "update mutation reports invalid values without saving them", %{conn: conn} do
    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation {
          updateAppearanceSettings(palette: "vaporwave") {
            appearanceSettings { palette }
          }
        }
        """
      })

    assert %{"errors" => [%{"message" => "palette is invalid"}]} = json_response(conn, 200)
    assert %{palette: "claret"} = Appearance.settings()
  end

  defp update_appearance(conn, args) do
    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation {
          updateAppearanceSettings(#{args}) {
            appearanceSettings { palette themeStyle }
          }
        }
        """
      })

    %{"data" => %{"updateAppearanceSettings" => %{"appearanceSettings" => settings}}} =
      json_response(conn, 200)

    settings
  end
end
