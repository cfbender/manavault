defmodule ManavaultWeb.Router do
  use ManavaultWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :protect_from_forgery
    plug :put_secure_browser_headers
  end

  pipeline :authenticated_browser do
    plug ManavaultWeb.Plugs.Authentication, :browser
  end

  pipeline :api do
    plug :accepts, ["json"]
    plug :fetch_session
  end

  pipeline :authenticated_api do
    plug ManavaultWeb.Plugs.Authentication, :api
  end

  scope "/", ManavaultWeb do
    get "/site.webmanifest", PwaController, :manifest
    get "/sw.js", PwaController, :service_worker
    get "/.well-known/assetlinks.json", PwaController, :asset_links
    get "/share/decks/:token/preview.svg", AppController, :share_deck_preview_image
    get "/share/decks/:token/preview.png", AppController, :share_deck_preview_png
  end

  scope "/", ManavaultWeb do
    pipe_through :browser

    get "/login", AuthController, :new
    post "/login", AuthController, :create
    get "/share/decks/:token", AppController, :share_deck
    get "/scryfall-assets/*path", ScryfallAssetController, :show
  end

  scope "/", ManavaultWeb do
    pipe_through [:browser, :authenticated_browser]

    get "/", AppController, :index
    get "/settings", AppController, :index
    get "/cards", AppController, :index
    get "/cards/:id", AppController, :index
    get "/decks", AppController, :index
    get "/decks/:id", AppController, :index
    get "/decks/:id/playtest", AppController, :index
    get "/collection", AppController, :index
    get "/collection/new", AppController, :index
    get "/collection/locations/:id", AppController, :index
    get "/collection/:id/edit", AppController, :index
    post "/logout", AuthController, :delete
  end

  scope "/" do
    pipe_through :api

    get "/health", ManavaultWeb.HealthController, :show
    forward "/share/graphql", Absinthe.Plug, schema: ManavaultWeb.PublicShareSchema
  end

  scope "/" do
    pipe_through [:api, :authenticated_api]

    forward "/api/graphql", Absinthe.Plug, schema: ManavaultWeb.Schema
  end

  # Other scopes may use custom stacks.
  # scope "/api", ManavaultWeb do
  #   pipe_through :api
  # end

  # Enable Swoosh mailbox preview in development.
  if Application.compile_env(:manavault, :dev_routes) do
    scope "/dev" do
      pipe_through :browser

      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end
end
