defmodule ManavaultWeb.AppController do
  use ManavaultWeb, :controller

  alias ManavaultWeb.AssetVersion

  def index(conn, _params) do
    conn
    |> put_resp_content_type("text/html")
    |> put_resp_header("cache-control", "no-cache, no-store, must-revalidate")
    |> put_resp_header("pragma", "no-cache")
    |> send_resp(200, app_html(get_csrf_token(), conn))
  end

  defp app_html(csrf_token, conn) do
    asset_version = AssetVersion.current()
    encoded_asset_version = Jason.encode!(asset_version)
    app_css_path = static_path(conn, "/assets/css/app.css")

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
        app_js_path = static_path(conn, "/assets/react/app.js")
        ~s(<script defer type="module" src="#{app_js_path}"></script>)
      end

    """
    <!DOCTYPE html>
    <html lang="en" class="h-screen w-screen">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="csrf-token" content="#{csrf_token}" />
        <meta name="application-name" content="ManaVault" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="ManaVault" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#166534" />
        <title>ManaVault</title>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="manifest" href="/site.webmanifest?v=#{asset_version}" />
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

  defp vite_dev_server?(conn) do
    Application.get_env(:manavault, :vite_dev_server?, false) && local_host?(conn.host)
  end

  defp local_host?("localhost"), do: true
  defp local_host?("127.0.0.1"), do: true
  defp local_host?("::1"), do: true
  defp local_host?(_host), do: false
end
