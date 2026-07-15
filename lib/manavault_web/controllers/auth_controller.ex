defmodule ManavaultWeb.AuthController do
  use ManavaultWeb, :controller

  alias Manavault.Auth
  alias Manavault.Auth.AttemptLimiter
  alias ManavaultWeb.Plugs.Authentication

  def new(conn, params) do
    cond do
      Auth.disabled?() ->
        redirect(conn, to: safe_return_to(params["return_to"]))

      Authentication.authenticated?(conn) ->
        redirect(conn, to: safe_return_to(params["return_to"]))

      !Auth.configured?() ->
        conn
        |> put_resp_content_type("text/html")
        |> send_resp(
          503,
          login_html(get_csrf_token(), params["return_to"], missing_hash_message())
        )

      true ->
        conn
        |> put_resp_content_type("text/html")
        |> send_resp(200, login_html(get_csrf_token(), params["return_to"], nil))
    end
  end

  def create(conn, %{"password" => password} = params) do
    return_to = safe_return_to(params["return_to"])

    cond do
      Auth.disabled?() ->
        redirect(conn, to: return_to)

      !Auth.configured?() ->
        conn
        |> put_resp_content_type("text/html")
        |> send_resp(503, login_html(get_csrf_token(), return_to, missing_hash_message()))

      true ->
        handle_password_login(conn, password, return_to)
    end
  end

  def create(conn, params) do
    conn
    |> put_resp_content_type("text/html")
    |> send_resp(400, login_html(get_csrf_token(), params["return_to"], "Password is required"))
  end

  def delete(conn, _params) do
    conn
    |> Authentication.sign_out()
    |> redirect(to: "/login")
  end

  defp handle_password_login(conn, password, return_to) do
    client_id = client_id(conn)

    case AttemptLimiter.check(client_id) do
      :permanently_banned ->
        permanently_banned_response(conn, return_to)

      {:rate_limited, retry_after} ->
        rate_limited_response(conn, return_to, retry_after)

      :ok ->
        verify_password_login(conn, password, return_to, client_id)
    end
  end

  defp verify_password_login(conn, password, return_to, client_id) do
    if Auth.verify_admin_password(password) do
      AttemptLimiter.reset(client_id)

      conn
      |> Authentication.sign_in()
      |> redirect(to: return_to)
    else
      case AttemptLimiter.record_failure(client_id) do
        :banned -> permanently_banned_response(conn, return_to)
        :ok -> incorrect_password_response(conn, return_to)
      end
    end
  end

  defp incorrect_password_response(conn, return_to) do
    conn
    |> put_resp_content_type("text/html")
    |> send_resp(401, login_html(get_csrf_token(), return_to, "Incorrect password"))
  end

  defp permanently_banned_response(conn, return_to) do
    conn
    |> put_resp_content_type("text/html")
    |> send_resp(403, login_html(get_csrf_token(), return_to, permanently_banned_message()))
  end

  defp permanently_banned_message do
    "Too many incorrect password attempts. This client is permanently blocked."
  end

  defp rate_limited_response(conn, return_to, retry_after) do
    conn
    |> put_resp_header("retry-after", Integer.to_string(retry_after))
    |> put_resp_content_type("text/html")
    |> send_resp(429, login_html(get_csrf_token(), return_to, rate_limited_message(retry_after)))
  end

  defp rate_limited_message(retry_after) when retry_after < 120 do
    "Too many incorrect password attempts. Try again in #{retry_after} seconds."
  end

  defp rate_limited_message(retry_after) do
    minutes = retry_after |> Kernel./(60) |> ceil()
    "Too many incorrect password attempts. Try again in #{minutes} minutes."
  end

  defp client_id(conn), do: ManavaultWeb.ClientIP.identifier(conn)

  defp safe_return_to(path) when is_binary(path) do
    if local_absolute_path?(path) and decoded_variants_safe?(path), do: path, else: "/"
  rescue
    _ -> "/"
  end

  defp safe_return_to(_path), do: "/"

  defp local_absolute_path?(path) do
    String.valid?(path) and
      safe_path_characters?(path) and
      valid_percent_encoding?(path) and
      absolute_path_uri?(path)
  end

  defp absolute_path_uri?(path) do
    case URI.new(path) do
      {:ok, %URI{scheme: nil, userinfo: nil, host: nil, port: nil, path: uri_path}}
      when is_binary(uri_path) ->
        single_slash_path?(uri_path)

      _ ->
        false
    end
  end

  defp decoded_variants_safe?(path) do
    path
    |> decoded_variants()
    |> Enum.all?(&normalized_absolute_path?/1)
  end

  defp decoded_variants(path) do
    percent_decoded = URI.decode(path)
    form_decoded = URI.decode_www_form(path)

    [
      path,
      percent_decoded,
      form_decoded,
      URI.decode(percent_decoded),
      URI.decode_www_form(percent_decoded),
      URI.decode(form_decoded),
      URI.decode_www_form(form_decoded)
    ]
  end

  defp normalized_absolute_path?(path) do
    String.valid?(path) and safe_path_characters?(path) and single_slash_path?(path)
  end

  defp single_slash_path?(path) do
    String.starts_with?(path, "/") and not String.starts_with?(path, "//")
  end

  defp safe_path_characters?(path), do: not contains_unsafe_path_character?(path)

  defp contains_unsafe_path_character?(<<>>), do: false

  defp contains_unsafe_path_character?(<<character, _rest::binary>>)
       when character <= 31 or character == 127 or character == ?\\,
       do: true

  defp contains_unsafe_path_character?(<<_character, rest::binary>>) do
    contains_unsafe_path_character?(rest)
  end

  defp valid_percent_encoding?(<<>>), do: true

  defp valid_percent_encoding?(<<?%, first, second, rest::binary>>)
       when (first in ?0..?9 or first in ?a..?f or first in ?A..?F) and
              (second in ?0..?9 or second in ?a..?f or second in ?A..?F) do
    valid_percent_encoding?(rest)
  end

  defp valid_percent_encoding?(<<?%, _rest::binary>>), do: false

  defp valid_percent_encoding?(<<_character, rest::binary>>) do
    valid_percent_encoding?(rest)
  end

  defp missing_hash_message do
    "Admin password hash is missing. Set MANAVAULT_ADMIN_PASSWORD_HASH or explicitly disable auth with MANAVAULT_AUTH_DISABLED=true."
  end

  defp login_html(csrf_token, return_to, error) do
    escaped_csrf_token = html_escape(csrf_token)
    escaped_return_to = return_to |> safe_return_to() |> html_escape()

    error_markup =
      if error do
        ~s(<p class="error" role="alert">#{html_escape(error)}</p>)
      else
        ""
      end

    """
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex,nofollow" />
        <title>Sign in · ManaVault</title>
        <style>
          :root {
            color-scheme: dark;
            --base-100: oklch(16.36% 0.0318 349.63);
            --base-200: oklch(21.51% 0.0182 6.61);
            --base-300: oklch(25.49% 0.0193 1.93);
            --base-content: oklch(87.16% 0.0197 72.55);
            --primary: oklch(61.28% 0.1407 4.1);
            --primary-content: oklch(96% 0.01 10);
            --secondary: oklch(69.78% 0.0851 127.42);
            --accent: oklch(75.63% 0.0947 74);
            --error: oklch(56.49% 0.1651 29.81);
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }

          * { box-sizing: border-box; }

          body {
            min-height: 100dvh;
            margin: 0;
            overflow-x: hidden;
            background:
              radial-gradient(circle at 15% 86%, color-mix(in oklch, var(--secondary), transparent 58%), transparent 27rem),
              radial-gradient(circle at 88% 84%, color-mix(in oklch, var(--secondary), transparent 64%), transparent 24rem),
              radial-gradient(circle at 50% -12%, color-mix(in oklch, var(--primary), transparent 72%), transparent 34rem),
              linear-gradient(180deg, #1a080e 0%, var(--base-100) 58%, #120817 100%);
            color: var(--base-content);
          }

          body::before {
            content: "";
            position: fixed;
            inset: 0;
            pointer-events: none;
            background:
              linear-gradient(90deg, rgb(0 0 0 / 0.2), rgb(0 0 0 / 0), rgb(0 0 0 / 0.25)),
              color-mix(in oklch, var(--base-100), transparent 45%);
            backdrop-filter: blur(2px);
          }

          .shell {
            position: relative;
            z-index: 1;
            min-height: 100dvh;
            padding: calc(1rem + env(safe-area-inset-top, 0px)) clamp(1rem, 3vw, 2rem) 3rem;
          }

          .brand {
            display: inline-flex;
            align-items: center;
            gap: 0.75rem;
            color: var(--base-content);
            font-size: clamp(1.25rem, 2vw, 1.6rem);
            font-weight: 950;
            letter-spacing: -0.04em;
            text-decoration: none;
          }

          .brand img {
            width: 1.75rem;
            height: 1.75rem;
            filter: drop-shadow(0 0.75rem 1.25rem rgb(0 0 0 / 0.4));
          }

          main {
            width: min(100%, 66rem);
            margin: clamp(5rem, 14vh, 9rem) auto 0;
            display: grid;
            gap: 2rem;
          }

          .hero {
            max-width: 48rem;
          }

          .eyebrow {
            margin: 0 0 0.75rem;
            color: var(--accent);
            font-size: 0.78rem;
            font-weight: 900;
            letter-spacing: 0.16em;
            text-transform: uppercase;
          }

          h1 {
            max-width: 46rem;
            margin: 0;
            color: color-mix(in oklch, var(--base-content), white 10%);
            font-size: clamp(3.25rem, 8vw, 5.5rem);
            font-weight: 1000;
            letter-spacing: -0.08em;
            line-height: 0.9;
            text-wrap: balance;
          }

          .lede {
            max-width: 42rem;
            margin: 1.25rem 0 0;
            color: color-mix(in oklch, var(--base-content), transparent 28%);
            font-size: clamp(1.05rem, 2vw, 1.35rem);
            line-height: 1.6;
          }

          .card {
            width: min(100%, 35rem);
            display: grid;
            gap: 1rem;
            border: 1px solid color-mix(in oklch, var(--primary), var(--base-300) 58%);
            border-radius: 0.75rem;
            padding: clamp(1rem, 3vw, 1.5rem);
            background: color-mix(in oklch, #16020b, transparent 8%);
            box-shadow: 0 2rem 6rem rgb(0 0 0 / 0.35), inset 0 1px 0 rgb(255 255 255 / 0.05);
          }

          .error {
            margin: 0;
            border: 1px solid color-mix(in oklch, var(--error), white 18%);
            border-radius: 0.7rem;
            padding: 0.85rem 1rem;
            background: color-mix(in oklch, var(--error), transparent 74%);
            color: color-mix(in oklch, var(--error), white 70%);
            line-height: 1.45;
          }

          label {
            display: grid;
            gap: 0.45rem;
            color: color-mix(in oklch, var(--base-content), transparent 10%);
            font-weight: 800;
          }

          input[type="password"] {
            width: 100%;
            min-height: 2.35rem;
            border: 1px solid color-mix(in oklch, var(--primary), var(--base-300) 60%);
            border-radius: 0.35rem;
            padding: 0.65rem 0.8rem;
            background: #21000d;
            color: var(--base-content);
            font: inherit;
            outline: none;
            box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.03);
          }

          input[type="password"]:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 3px color-mix(in oklch, var(--primary), transparent 70%);
          }

          button {
            min-height: 2.5rem;
            border: 0;
            border-radius: 0.35rem;
            padding: 0.7rem 1.1rem;
            background: color-mix(in oklch, var(--primary), white 4%);
            color: var(--primary-content);
            font: inherit;
            font-weight: 900;
            cursor: pointer;
            box-shadow: 0 1rem 2.5rem color-mix(in oklch, var(--primary), transparent 72%);
          }

          button:focus-visible {
            outline: 3px solid color-mix(in oklch, var(--primary), transparent 55%);
            outline-offset: 3px;
          }

          @media (min-width: 56rem) {
            main {
              grid-template-columns: minmax(0, 1fr) 25rem;
              align-items: end;
            }

            .card {
              justify-self: end;
            }
          }
        </style>
      </head>
      <body>
        <div class="shell">
          <a class="brand" href="/">
            <img src="/images/logo.svg" alt="" />
            <span>ManaVault</span>
          </a>
          <main>
            <section class="hero" aria-labelledby="login-title">
              <p class="eyebrow">Owner access</p>
              <h1 id="login-title">Your Magic vault, secured.</h1>
              <p class="lede">Sign in to manage your collection, decks, backups, and local card catalog.</p>
            </section>
            <form class="card" method="post" action="/login">
              #{error_markup}
              <input type="hidden" name="_csrf_token" value="#{escaped_csrf_token}" />
              <input type="hidden" name="return_to" value="#{escaped_return_to}" />
              <label>
                Password
                <input name="password" type="password" autocomplete="current-password" required autofocus />
              </label>
              <button type="submit">Sign in</button>
            </form>
          </main>
        </div>
      </body>
    </html>
    """
  end

  defp html_escape(value) do
    value
    |> to_string()
    |> Phoenix.HTML.html_escape()
    |> Phoenix.HTML.safe_to_string()
  end
end
