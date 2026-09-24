defmodule ManavaultWeb.AppController do
  use ManavaultWeb, :controller

  alias Manavault.Appearance
  alias Manavault.Catalog
  alias Manavault.Catalog.Deck
  alias Manavault.Catalog.Decks.ShareToken
  alias Manavault.Trade
  alias ManavaultWeb.{AssetVersion, DeckSharePreview}
  alias ManavaultWeb.DeckSharePreview.ArtifactCache
  alias ManavaultWeb.Plugs.Authentication

  def index(conn, _params), do: render_app(conn, default_preview(conn))

  def share_deck(conn, %{"token" => token}) do
    case share_preview(conn, token) do
      %{kind: :deck} = preview -> render_app(conn, preview)
      _missing -> send_resp(conn, 404, "")
    end
  end

  def share_wants(conn, %{"token" => token}) do
    render_valid_share(conn, token, Trade.wants_share_token())
  end

  def share_binder(conn, %{"token" => token}) do
    render_valid_share(conn, token, Trade.binder_share_token())
  end

  defp render_valid_share(conn, token, token) when is_binary(token) do
    if ShareToken.valid?(token),
      do: render_app(conn, default_preview(conn)),
      else: send_resp(conn, 404, "")
  end

  defp render_valid_share(conn, _provided_token, _current_token), do: send_resp(conn, 404, "")

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
        case ArtifactCache.png(preview) do
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
    vite_dev? = vite_dev_server?(conn)

    conn
    |> put_resp_header("cache-control", "no-cache, no-store, must-revalidate")
    |> put_resp_header("pragma", "no-cache")
    |> render(:app,
      layout: false,
      csrf_token: get_csrf_token(),
      preview: preview,
      appearance: account_appearance(conn),
      asset_version: AssetVersion.current(),
      vite_dev?: vite_dev?,
      vite_origin: if(vite_dev? and not vite_proxy?(conn), do: "http://127.0.0.1:5173", else: "")
    )
  end

  # Anonymous visitors to public share pages keep their own per-browser
  # appearance; only the signed-in owner gets the account's saved choice.
  defp account_appearance(conn) do
    if Authentication.authenticated?(conn), do: Appearance.settings()
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

  defp absolute_url(_conn, path), do: ManavaultWeb.Endpoint.url() <> path

  defp encode_path_segment(segment), do: URI.encode(segment, &URI.char_unreserved?/1)

  defp vite_dev_server?(conn) do
    Application.get_env(:manavault, :vite_dev_server?, false) &&
      (local_host?(conn.host) || vite_proxy?(conn))
  end

  defp vite_proxy?(conn), do: get_req_header(conn, "x-manavault-vite-proxy") == ["1"]

  defp local_host?("localhost"), do: true
  defp local_host?("127.0.0.1"), do: true
  defp local_host?("::1"), do: true
  defp local_host?(_host), do: false
end
