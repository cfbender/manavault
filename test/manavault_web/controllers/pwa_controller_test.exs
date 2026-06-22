defmodule ManavaultWeb.PwaControllerTest do
  use ManavaultWeb.ConnCase

  @official_android_fingerprint "6B:3F:13:D6:6A:11:BB:49:FE:D8:64:5C:7D:26:B8:2E:BD:FC:8C:14:19:53:1C:A3:35:E6:68:DF:F7:4E:13:89"

  test "GET /site.webmanifest serves credentialed PWA metadata", %{conn: conn} do
    conn = get(conn, ~p"/site.webmanifest")

    assert %{
             "icons" => icons,
             "name" => "ManaVault",
             "prefer_related_applications" => false
           } = json_response(conn, 200)

    assert get_resp_header(conn, "content-type") == ["application/manifest+json; charset=utf-8"]
    assert Enum.any?(icons, &(&1["src"] =~ "android-chrome-192x192-maskable.png"))
    assert Enum.any?(icons, &(&1["src"] =~ "android-chrome-512x512-maskable.png"))
  end

  test "GET /.well-known/assetlinks.json serves the official Android fingerprint by default", %{
    conn: conn
  } do
    previous = System.get_env("MANAVAULT_ANDROID_CERT_FINGERPRINTS")
    System.delete_env("MANAVAULT_ANDROID_CERT_FINGERPRINTS")

    on_exit(fn ->
      if is_nil(previous) do
        System.delete_env("MANAVAULT_ANDROID_CERT_FINGERPRINTS")
      else
        System.put_env("MANAVAULT_ANDROID_CERT_FINGERPRINTS", previous)
      end
    end)

    conn = get(conn, ~p"/.well-known/assetlinks.json")

    assert [link] = json_response(conn, 200)
    assert link["target"]["sha256_cert_fingerprints"] == [@official_android_fingerprint]
  end

  test "GET /.well-known/assetlinks.json allows custom Android app link fingerprints", %{
    conn: conn
  } do
    previous = System.get_env("MANAVAULT_ANDROID_CERT_FINGERPRINTS")
    fingerprint = "AA:BB:CC:DD"
    System.put_env("MANAVAULT_ANDROID_CERT_FINGERPRINTS", fingerprint)

    on_exit(fn ->
      if is_nil(previous) do
        System.delete_env("MANAVAULT_ANDROID_CERT_FINGERPRINTS")
      else
        System.put_env("MANAVAULT_ANDROID_CERT_FINGERPRINTS", previous)
      end
    end)

    conn = get(conn, ~p"/.well-known/assetlinks.json")

    assert [link] = json_response(conn, 200)
    assert link["relation"] == ["delegate_permission/common.handle_all_urls"]
    assert link["target"]["namespace"] == "android_app"
    assert link["target"]["package_name"] == "dev.cfb.manavault"
    assert link["target"]["sha256_cert_fingerprints"] == [fingerprint]
  end
end
