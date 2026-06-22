defmodule ManavaultWeb.Router do
  use ManavaultWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :protect_from_forgery
    plug :put_secure_browser_headers
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/", ManavaultWeb do
    get "/site.webmanifest", PwaController, :manifest
    get "/sw.js", PwaController, :service_worker
    get "/.well-known/assetlinks.json", PwaController, :asset_links
  end

  scope "/", ManavaultWeb do
    pipe_through :browser

    get "/", AppController, :index
    get "/settings", AppController, :index
    get "/cards", AppController, :index
    get "/cards/:id", AppController, :index
    get "/decks", AppController, :index
    get "/decks/:id", AppController, :index
    get "/decks/:id/playtest", AppController, :index
    get "/share/decks/:token", AppController, :index
    get "/collection", AppController, :index
    get "/collection/new", AppController, :index
    get "/collection/locations/:id", AppController, :index
    get "/collection/:id/edit", AppController, :index
    get "/scryfall-assets/*path", ScryfallAssetController, :show
  end

  scope "/" do
    pipe_through :api

    get "/health", ManavaultWeb.HealthController, :show
    forward "/api/graphql", Absinthe.Plug, schema: ManavaultWeb.Schema
    forward "/share/graphql", Absinthe.Plug, schema: ManavaultWeb.PublicShareSchema
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
