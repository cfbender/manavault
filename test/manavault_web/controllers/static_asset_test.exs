defmodule ManavaultWeb.StaticAssetTest do
  use ManavaultWeb.ConnCase, async: true

  test "serves the PWA manifest with install metadata", %{conn: conn} do
    conn = get(conn, "/site.webmanifest")

    assert conn.status == 200

    manifest = Jason.decode!(conn.resp_body)

    assert manifest["name"] == "ManaVault"
    assert manifest["short_name"] == "ManaVault"
    assert manifest["display"] == "standalone"
    assert manifest["start_url"] == "/"
    assert Enum.any?(manifest["icons"], &(&1["src"] == "/android-chrome-192x192.png"))
    assert Enum.any?(manifest["icons"], &(&1["src"] == "/android-chrome-512x512.png"))
  end

  test "serves manifest icons referenced by the PWA manifest", %{conn: conn} do
    assert get(conn, "/android-chrome-192x192.png").status == 200
    assert get(conn, "/android-chrome-512x512.png").status == 200
  end
end
