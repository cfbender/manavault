defmodule ManavaultWeb.PwaController do
  use ManavaultWeb, :controller

  alias ManavaultWeb.AssetVersion

  @cache_control "no-cache, no-store, must-revalidate"

  def manifest(conn, _params) do
    version = AssetVersion.current()

    conn
    |> put_no_store_headers()
    |> put_resp_content_type("application/manifest+json")
    |> json(%{
      name: "ManaVault",
      short_name: "ManaVault",
      description: "Local Magic collection management with deck allocation and import workflows.",
      id: "/",
      start_url: "/",
      scope: "/",
      display: "standalone",
      prefer_related_applications: false,
      background_color: "#0f172a",
      theme_color: "#166534",
      categories: ["utilities", "productivity"],
      icons: [
        icon("/android-chrome-192x192.png", "192x192", "any", version),
        icon("/android-chrome-512x512.png", "512x512", "any", version),
        icon("/android-chrome-192x192.png", "192x192", "maskable", version),
        icon("/android-chrome-512x512.png", "512x512", "maskable", version)
      ],
      screenshots: [
        %{
          src: versioned_path("/screenshots/desktop-collection.png", version),
          sizes: "1280x720",
          type: "image/png",
          form_factor: "wide",
          label: "Collection dashboard"
        }
      ],
      shortcuts: [
        shortcut("Collection", "Collection", "Open the card collection.", "/collection", version)
      ]
    })
  end

  def service_worker(conn, _params) do
    conn
    |> put_no_store_headers()
    |> put_resp_header("service-worker-allowed", "/")
    |> put_resp_content_type("text/javascript")
    |> send_resp(200, service_worker_js(AssetVersion.current()))
  end

  defp put_no_store_headers(conn) do
    conn
    |> put_resp_header("cache-control", @cache_control)
    |> put_resp_header("pragma", "no-cache")
    |> put_resp_header("expires", "0")
  end

  defp icon(src, sizes, purpose, version) do
    %{
      src: versioned_path(src, version),
      sizes: sizes,
      type: "image/png",
      purpose: purpose
    }
  end

  defp shortcut(name, short_name, description, url, version) do
    %{
      name: name,
      short_name: short_name,
      description: description,
      url: url,
      icons: [
        %{
          src: versioned_path("/android-chrome-192x192.png", version),
          sizes: "192x192",
          type: "image/png"
        }
      ]
    }
  end

  defp versioned_path(path, version), do: path <> "?v=" <> version

  defp service_worker_js(version) do
    """
    const CACHE_NAME = "manavault-pwa-v#{version}"
    const OFFLINE_URL = "/offline.html"
    const PRECACHE_URLS = [
      OFFLINE_URL,
      "/android-chrome-192x192.png",
      "/android-chrome-512x512.png",
      "/favicon-32x32.png",
    ]

    self.addEventListener("install", (event) => {
      event.waitUntil(
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.addAll(PRECACHE_URLS))
          .then(() => self.skipWaiting()),
      )
    })

    self.addEventListener("activate", (event) => {
      event.waitUntil(
        caches
          .keys()
          .then((names) =>
            Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))),
          )
          .then(() => self.clients.claim()),
      )
    })

    self.addEventListener("fetch", (event) => {
      if (event.request.method !== "GET") return

      const url = new URL(event.request.url)
      if (url.origin !== self.location.origin) return

      if (event.request.mode === "navigate") {
        event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)))
        return
      }

      event.respondWith(
        fetch(event.request).catch(() =>
          caches.match(event.request).then((response) => response || Response.error()),
        ),
      )
    })
    """
  end
end
