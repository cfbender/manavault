defmodule ManavaultWeb.Router do
  use ManavaultWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, html: {ManavaultWeb.Layouts, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/", ManavaultWeb do
    pipe_through :browser

    get "/", AppController, :index
    get "/scan", AppController, :index
    get "/cards", AppController, :index
    get "/cards/:id", AppController, :index
    get "/decks", AppController, :index
    get "/decks/:id", AppController, :index
    get "/collection", AppController, :index
    get "/collection/new", AppController, :index
    get "/scan-sessions", AppController, :index
    get "/scan-sessions/:id", AppController, :index
    get "/scan-sessions/:id/scanner", AppController, :index
    get "/collection/locations/:id", AppController, :index
    get "/collection/:id/edit", AppController, :index
    get "/scryfall-assets/*path", ScryfallAssetController, :show
  end

  scope "/" do
    pipe_through :api

    get "/health", ManavaultWeb.HealthController, :show
    forward "/api/graphql", Absinthe.Plug, schema: ManavaultWeb.Schema
  end

  # Other scopes may use custom stacks.
  # scope "/api", ManavaultWeb do
  #   pipe_through :api
  # end

  # Enable LiveDashboard and Swoosh mailbox preview in development
  if Application.compile_env(:manavault, :dev_routes) do
    # If you want to use the LiveDashboard in production, you should put
    # it behind authentication and allow only admins to access it.
    # If your application does not have an admins-only section yet,
    # you can use Plug.BasicAuth to set up some basic authentication
    # as long as you are also using SSL (which you should anyway).
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through :browser

      live_dashboard "/dashboard", metrics: ManavaultWeb.Telemetry
      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end
end
