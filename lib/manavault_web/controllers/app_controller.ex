defmodule ManavaultWeb.AppController do
  use ManavaultWeb, :controller

  alias Manavault.Catalog
  alias Manavault.Catalog.Deck
  alias Manavault.Catalog.Decks.ShareToken
  alias ManavaultWeb.{AssetVersion, DeckSharePreview}

  def index(conn, _params), do: render_app(conn, default_preview(conn))

  def share_deck(conn, %{"token" => token}), do: render_app(conn, share_preview(conn, token))

  def share_deck_preview_image(conn, %{"token" => token}) do
    case share_preview(conn, token) do
      %{kind: :deck} = preview ->
        conn
        |> put_resp_content_type("image/svg+xml")
        |> put_resp_header("cache-control", "public, max-age=300")
        |> send_resp(200, DeckSharePreview.svg(preview))

      _missing ->
        send_resp(conn, 404, "")
    end
  end

  def share_deck_preview_png(conn, %{"token" => token}) do
    case share_preview(conn, token) do
      %{kind: :deck} = preview ->
        preview = %{preview | cover_image_url: raster_cover_image_url(preview.cover_image_url)}

        case DeckSharePreview.png(preview) do
          {:ok, png} ->
            conn
            |> put_resp_content_type("image/png", nil)
            |> put_resp_header("cache-control", "public, max-age=300")
            |> send_resp(200, png)

          {:error, _reason} ->
            send_resp(conn, 503, "")
        end

      _missing ->
        send_resp(conn, 404, "")
    end
  end

  defp render_app(conn, preview) do
    conn
    |> put_resp_content_type("text/html")
    |> put_resp_header("cache-control", "no-cache, no-store, must-revalidate")
    |> put_resp_header("pragma", "no-cache")
    |> send_resp(200, app_html(get_csrf_token(), conn, preview))
  end

  defp app_html(csrf_token, conn, preview) do
    asset_version = AssetVersion.current()
    encoded_asset_version = Jason.encode!(asset_version)
    app_css_path = static_path(conn, "/assets/css/app.css")
    metadata_tags = metadata_tags(preview)
    page_title = html_escape(preview.title)

    react_scripts =
      if vite_dev_server?(conn) do
        """
        <script type="module">
          import RefreshRuntime from "http://127.0.0.1:5173/@react-refresh"
          RefreshRuntime.injectIntoGlobalHook(window)
          window.$RefreshReg$ = () => {}
          window.$RefreshSig$ = () => (type) => type
          window.__vite_plugin_react_preamble_installed__ = true
        </script>
        <script type="module" src="http://127.0.0.1:5173/@vite/client"></script>
        <script type="module" src="http://127.0.0.1:5173/assets/react/src/main.tsx"></script>
        """
      else
        # Keep the ESM entry at the same canonical URL Vite chunks use when
        # importing ../app.js. A version query creates a second module instance,
        # remounts React, and duplicates Apollo queries in production.
        ~s(<script defer type="module" src="/assets/react/app.js"></script>)
      end

    """
    <!DOCTYPE html>
    <html lang="en" class="h-screen w-screen">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="csrf-token" content="#{csrf_token}" />
        #{metadata_tags}
        <meta name="application-name" content="ManaVault" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="ManaVault" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#166534" />
        <title>#{page_title}</title>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="manifest" href="/site.webmanifest?v=#{asset_version}" crossorigin="use-credentials" />
        <link rel="stylesheet" href="#{app_css_path}" />
        <script>
          window.__manavaultAssetVersion = #{encoded_asset_version};
          (() => {
            if (window.__manavaultPwaInstallCapture) return;

            window.__manavaultPwaInstallCapture = {
              prompt: null,
              fired: false,
              firedAt: null
            };

            window.addEventListener("beforeinstallprompt", (event) => {
              event.preventDefault();
              window.__manavaultPwaInstallCapture = {
                prompt: event,
                fired: true,
                firedAt: Date.now()
              };
              window.dispatchEvent(new Event("manavault:pwa-install-available"));
            });
          })();
        </script>
        #{react_scripts}
        <script>
          (() => {
            const systemTheme = () => matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
            const storageKey = "manavault:theme";

            const storedTheme = () => {
              try {
                return localStorage.getItem(storageKey) || "system";
              } catch {
                return "system";
              }
            };

            const persistTheme = (theme) => {
              try {
                if (theme === "system") {
                  localStorage.removeItem(storageKey);
                } else {
                  localStorage.setItem(storageKey, theme);
                }
              } catch {
                // Storage can be unavailable or full. The DOM theme still applies for this page load.
              }
            };

            const setTheme = (theme) => {
              persistTheme(theme);
              if (theme === "system") {
                document.documentElement.setAttribute("data-theme", systemTheme());
                document.documentElement.setAttribute("data-theme-source", "system");
              } else {
                document.documentElement.setAttribute("data-theme", theme);
                document.documentElement.setAttribute("data-theme-source", "user");
              }
            };
            if (!document.documentElement.hasAttribute("data-theme")) {
              setTheme(storedTheme());
            }
            window.addEventListener("storage", (e) => e.key === storageKey && setTheme(e.newValue || "system"));

            matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
              if (document.documentElement.getAttribute("data-theme-source") === "system") {
                document.documentElement.setAttribute("data-theme", systemTheme());
              }
            });
          })();
        </script>
      </head>
      <body class="h-screen w-screen overflow-x-hidden">
        <div id="manavault-root"></div>
      </body>
    </html>
    """
  end

  defp default_preview(conn, attrs \\ %{}) do
    DeckSharePreview.default(
      Map.merge(
        %{
          url: absolute_url(conn, conn.request_path || "/"),
          image_url: absolute_url(conn, static_path(conn, "/android-chrome-512x512.png")),
          image_type: "image/png"
        },
        attrs
      )
    )
  end

  defp share_preview(conn, token) do
    if ShareToken.valid?(token) do
      case Catalog.get_deck_by_share_token(token) do
        %Deck{} = deck ->
          encoded_token = encode_path_segment(token)

          deck
          |> DeckSharePreview.from_deck(token)
          |> Map.merge(%{
            url: absolute_url(conn, "/share/decks/#{encoded_token}"),
            image_url: absolute_url(conn, "/share/decks/#{encoded_token}/preview.png"),
            image_type: "image/png"
          })

        nil ->
          missing_share_preview(conn)
      end
    else
      missing_share_preview(conn)
    end
  end

  defp missing_share_preview(conn) do
    default_preview(conn, %{
      title: "Shared deck · ManaVault",
      description: "Open a shared Magic deck in ManaVault.",
      image_alt: "ManaVault shared deck"
    })
  end

  defp raster_cover_image_url("data:" <> _rest = url), do: url

  defp raster_cover_image_url(url) when is_binary(url) do
    if scryfall_image_url?(url) do
      case Req.get(url, headers: [{"accept", "image/*"}], receive_timeout: 1_500) do
        {:ok, %{status: status, body: body, headers: headers}}
        when status in 200..299 and is_binary(body) ->
          content_type = response_content_type(headers)

          if image_content_type?(content_type) do
            "data:#{content_type};base64,#{Base.encode64(body)}"
          else
            url
          end

        _error ->
          url
      end
    else
      url
    end
  end

  defp raster_cover_image_url(url), do: url

  defp scryfall_image_url?(url) do
    case URI.parse(url) do
      %URI{scheme: scheme, host: host}
      when scheme in ["http", "https"] and host in ["cards.scryfall.io", "img.scryfall.com"] ->
        true

      _uri ->
        false
    end
  end

  defp response_content_type(headers) when is_map(headers) do
    headers
    |> Map.get("content-type", [])
    |> List.wrap()
    |> List.first()
    |> to_string()
    |> String.split(";", parts: 2)
    |> List.first()
  end

  defp response_content_type(_headers), do: nil

  defp image_content_type?(content_type) when is_binary(content_type),
    do: String.starts_with?(content_type, "image/")

  defp image_content_type?(_content_type), do: false

  defp metadata_tags(preview) do
    twitter_card =
      if present?(preview.image_url), do: "summary_large_image", else: "summary"

    [
      meta_tag("name", "description", preview.description),
      meta_tag("property", "og:site_name", "ManaVault"),
      meta_tag("property", "og:type", "website"),
      meta_tag("property", "og:title", preview.title),
      meta_tag("property", "og:description", preview.description),
      meta_tag("property", "og:url", preview.url),
      meta_tag("property", "og:image", preview.image_url),
      meta_tag("property", "og:image:type", preview.image_type),
      meta_tag("property", "og:image:width", preview.image_width),
      meta_tag("property", "og:image:height", preview.image_height),
      meta_tag("property", "og:image:alt", preview.image_alt),
      meta_tag("name", "twitter:card", twitter_card),
      meta_tag("name", "twitter:title", preview.title),
      meta_tag("name", "twitter:description", preview.description),
      meta_tag("name", "twitter:image", preview.image_url)
    ]
    |> Enum.reject(&(&1 == ""))
    |> Enum.join("\n        ")
  end

  defp meta_tag(_name_attr, _name, value) when value in [nil, ""], do: ""

  defp meta_tag(name_attr, name, value) do
    ~s(<meta #{name_attr}="#{html_escape(name)}" content="#{html_escape(value)}" />)
  end

  defp absolute_url(conn, path) do
    %URI{
      scheme: Atom.to_string(conn.scheme),
      host: conn.host,
      port: url_port(conn),
      path: path
    }
    |> URI.to_string()
  end

  defp url_port(%{scheme: :http, port: 80}), do: nil
  defp url_port(%{scheme: :https, port: 443}), do: nil
  defp url_port(%{port: port}), do: port

  defp encode_path_segment(segment), do: URI.encode(segment, &URI.char_unreserved?/1)

  defp present?(value), do: is_binary(value) and value != ""

  defp html_escape(value) do
    value
    |> to_string()
    |> Phoenix.HTML.html_escape()
    |> Phoenix.HTML.safe_to_string()
  end

  defp vite_dev_server?(conn) do
    Application.get_env(:manavault, :vite_dev_server?, false) && local_host?(conn.host)
  end

  defp local_host?("localhost"), do: true
  defp local_host?("127.0.0.1"), do: true
  defp local_host?("::1"), do: true
  defp local_host?(_host), do: false
end
