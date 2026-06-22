defmodule ManavaultWeb.StaticAssetTest do
  use ManavaultWeb.ConnCase, async: true

  alias ManavaultWeb.AssetVersion

  test "serves the PWA manifest with install metadata", %{conn: conn} do
    conn = get(conn, "/site.webmanifest")

    assert conn.status == 200
    assert get_resp_header(conn, "cache-control") == ["no-cache, no-store, must-revalidate"]

    manifest = Jason.decode!(conn.resp_body)
    asset_version = AssetVersion.current()

    assert manifest["name"] == "ManaVault"
    assert manifest["short_name"] == "ManaVault"
    assert manifest["id"] == "/"
    assert manifest["display"] == "standalone"
    assert manifest["prefer_related_applications"] == false
    assert manifest["start_url"] == "/"
    assert manifest["scope"] == "/"
    assert manifest["categories"] == ["utilities", "productivity"]

    assert Enum.any?(
             manifest["icons"],
             &(&1["src"] == "/android-chrome-192x192.png?v=#{asset_version}")
           )

    assert Enum.any?(
             manifest["icons"],
             &(&1["src"] == "/android-chrome-512x512.png?v=#{asset_version}")
           )

    assert Enum.any?(manifest["icons"], &(&1["purpose"] == "any"))
    assert Enum.any?(manifest["icons"], &(&1["purpose"] == "maskable"))
    assert Enum.any?(manifest["screenshots"], &(&1["form_factor"] == "wide"))
    assert Enum.any?(manifest["shortcuts"], &(&1["url"] == "/collection"))
  end

  test "serves manifest icons referenced by the PWA manifest", %{conn: conn} do
    assert get(conn, "/android-chrome-192x192.png").status == 200
    assert get(conn, "/android-chrome-512x512.png").status == 200
  end

  test "serves the service worker at app root scope", %{conn: conn} do
    conn = get(conn, "/sw.js")

    assert conn.status == 200
    assert get_resp_header(conn, "cache-control") == ["no-cache, no-store, must-revalidate"]
    assert get_resp_header(conn, "expires") == ["0"]
    assert get_resp_header(conn, "content-type") == ["text/javascript; charset=utf-8"]
    assert conn.resp_body =~ ~s|self.addEventListener("fetch"|
    assert conn.resp_body =~ ~s|CACHE_NAME = "manavault-pwa-v#{AssetVersion.current()}"|
    assert conn.resp_body =~ ~s|OFFLINE_URL = "/offline.html"|
  end

  test "serves the offline fallback page", %{conn: conn} do
    conn = get(conn, "/offline.html")

    assert conn.status == 200
    assert conn.resp_body =~ "ManaVault is offline"
  end

  test "serves PWA screenshots referenced by the manifest", %{conn: conn} do
    assert get(conn, "/screenshots/desktop-collection.png").status == 200
  end

  test "serves Vite entry modules with no-store cache headers", %{conn: conn} do
    entry_dir = Application.app_dir(:manavault, "priv/static/assets/react")
    entry_path = Path.join(entry_dir, "__manavault_static_entry_test.js")

    File.mkdir_p!(entry_dir)
    File.write!(entry_path, "import './assets/__manavault_static_alias_test.js'\n")

    on_exit(fn -> File.rm(entry_path) end)

    conn = get(conn, "/assets/react/__manavault_static_entry_test.js")

    assert conn.status == 200
    assert get_resp_header(conn, "content-type") == ["text/javascript"]

    assert get_resp_header(conn, "cache-control") == [
             "no-cache, no-store, must-revalidate"
           ]

    assert get_resp_header(conn, "pragma") == ["no-cache"]
    assert get_resp_header(conn, "expires") == ["0"]
  end

  test "serves Vite chunks from canonical and legacy root paths", %{conn: conn} do
    chunk_dir = Application.app_dir(:manavault, "priv/static/assets/react/assets")
    chunk_path = Path.join(chunk_dir, "__manavault_static_alias_test.js")

    File.mkdir_p!(chunk_dir)
    File.write!(chunk_path, "export default 1\n")

    on_exit(fn -> File.rm(chunk_path) end)

    canonical_conn = get(conn, "/assets/react/assets/__manavault_static_alias_test.js")
    legacy_conn = get(conn, "/assets/__manavault_static_alias_test.js")

    assert canonical_conn.status == 200
    assert canonical_conn.resp_body == "export default 1\n"

    assert get_resp_header(canonical_conn, "cache-control") == [
             "no-cache, no-store, must-revalidate"
           ]

    assert get_resp_header(canonical_conn, "pragma") == ["no-cache"]
    assert get_resp_header(canonical_conn, "expires") == ["0"]
    assert legacy_conn.status == 200
    assert get_resp_header(legacy_conn, "content-type") == ["text/javascript"]

    assert get_resp_header(legacy_conn, "cache-control") == [
             "no-cache, no-store, must-revalidate"
           ]

    assert get_resp_header(legacy_conn, "pragma") == ["no-cache"]
    assert get_resp_header(legacy_conn, "expires") == ["0"]
    assert legacy_conn.resp_body == canonical_conn.resp_body
  end

  test "root layout includes mobile install metadata", %{conn: conn} do
    conn = get(conn, "/")

    assert html_response(conn, 200) =~
             ~s|name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"|

    assert conn.resp_body =~ ~s|name="apple-mobile-web-app-capable" content="yes"|
    assert conn.resp_body =~ ~s|name="mobile-web-app-capable" content="yes"|
    assert conn.resp_body =~ ~s|name="theme-color" content="#166534"|

    assert conn.resp_body =~
             ~s|rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"|

    assert conn.resp_body =~
             ~s|rel="manifest" href="/site.webmanifest?v=#{AssetVersion.current()}"|

    assert conn.resp_body =~ ~s|window.__manavaultAssetVersion = "#{AssetVersion.current()}"|
    assert conn.resp_body =~ ~s|__manavaultPwaInstallCapture|
    assert conn.resp_body =~ ~s|href="/assets/css/app.css"|
    assert conn.resp_body =~ ~s|src="/assets/react/app.js"|
    assert conn.resp_body =~ ~s|id="manavault-root"|
    refute conn.resp_body =~ ~s|data-pwa-install-debug|
  end
end
