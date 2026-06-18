defmodule ManavaultWeb.AppController do
  use ManavaultWeb, :controller

  def index(conn, _params) do
    conn
    |> put_resp_content_type("text/html")
    |> send_resp(200, app_html(get_csrf_token()))
  end

  defp app_html(csrf_token) do
    react_scripts =
      if Application.get_env(:manavault, :vite_dev_server?, false) do
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
        ~s(<script defer type="module" src="/assets/react/app.js?v=20260618-4"></script>)
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
        <link rel="manifest" href="/site.webmanifest?v=20260618-4" />
        <link rel="stylesheet" href="/assets/css/app.css?v=20260618-4" />
        <script>
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

            const setTheme = (theme) => {
              if (theme === "system") {
                localStorage.removeItem(storageKey);
                document.documentElement.setAttribute("data-theme", systemTheme());
                document.documentElement.setAttribute("data-theme-source", "system");
              } else {
                localStorage.setItem(storageKey, theme);
                document.documentElement.setAttribute("data-theme", theme);
                document.documentElement.setAttribute("data-theme-source", "user");
              }
            };
            if (!document.documentElement.hasAttribute("data-theme")) {
              setTheme(localStorage.getItem(storageKey) || "system");
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
end
