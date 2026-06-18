defmodule ManavaultWeb.Layouts do
  @moduledoc """
  This module holds layouts and related functionality
  used by your application.
  """
  use ManavaultWeb, :html

  # Embed all files in layouts/* within this module.
  # The default root.html.heex file contains the HTML
  # skeleton of your application, namely HTML headers
  # and other static content.
  embed_templates "layouts/*"

  @doc """
  Renders your app layout.

  This function is typically invoked from every template,
  and it often contains your application menu, sidebar,
  or similar.

  ## Examples

      <Layouts.app flash={@flash}>
        <h1>Content</h1>
      </Layouts.app>

  """
  attr :flash, :map, required: true, doc: "the map of flash messages"

  attr :current_scope, :map,
    default: nil,
    doc: "the current [scope](https://phoenix.hexdocs.pm/scopes.html)"

  attr :variant, :atom, default: :default, values: [:default, :scanner]

  slot :inner_block, required: true

  def app(assigns) do
    ~H"""
    <header :if={@variant != :scanner} class="navbar app-shell-header px-4 sm:px-6 lg:px-8">
      <div class="flex-1">
        <a href="/" class="flex items-center gap-2 no-underline">
          <img src={~p"/images/logo.svg"} alt="" class="h-8 w-8" />
          <span class="hidden text-xl font-black tracking-tight sm:inline">ManaVault</span>
        </a>
      </div>
      <div class="flex-none">
        <div class="dropdown dropdown-end sm:hidden">
          <button
            type="button"
            tabindex="0"
            class="btn btn-square btn-ghost"
            aria-label="Open navigation menu"
          >
            <span class="text-2xl leading-none">☰</span>
          </button>
          <ul
            tabindex="0"
            class="menu dropdown-content z-50 mt-2 w-56 rounded-box border border-base-300 bg-base-100 p-2 text-base shadow-xl"
          >
            <li><a href="/cards">Cards</a></li>
            <li><a href="/collection">Collection</a></li>
            <li><a href="/decks">Decks</a></li>
            <li><a href="/scan">Scan</a></li>
            <li>
              <button
                id="pwa-install-button-mobile"
                type="button"
                class="btn btn-primary btn-sm hidden justify-start"
                data-pwa-install
                aria-label="Install app"
              >
                <.icon name="hero-arrow-down-tray" class="size-4" />
                <span data-pwa-install-label>Install</span>
              </button>
            </li>
            <li class="mt-2 px-2">
              <.theme_toggle />
            </li>
          </ul>
        </div>

        <ul class="hidden flex-row items-center gap-2 px-1 sm:flex">
          <li>
            <a href="/cards" class="btn btn-ghost btn-sm">Cards</a>
          </li>
          <li>
            <a href="/collection" class="btn btn-ghost btn-sm">Collection</a>
          </li>
          <li>
            <a href="/decks" class="btn btn-ghost btn-sm">Decks</a>
          </li>
          <li>
            <a href="/scan" class="btn btn-ghost btn-sm">Scan</a>
          </li>
          <li>
            <button
              id="pwa-install-button-desktop"
              type="button"
              class="btn btn-primary btn-sm hidden pointer-events-auto px-3"
              data-pwa-install
              aria-label="Install app"
            >
              <.icon name="hero-arrow-down-tray" class="size-4" />
              <span data-pwa-install-label>Install</span>
            </button>
          </li>
          <li>
            <.theme_toggle />
          </li>
        </ul>
      </div>
    </header>

    <main class={[
      @variant == :scanner &&
        "app-shell-main app-shell-main--full w-screen overflow-y-auto px-2 py-2 sm:px-4 sm:py-4 lg:px-6 lg:py-6",
      @variant != :scanner &&
        "app-shell-main h-[calc(100vh-4rem)] w-screen overflow-y-auto px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-20"
    ]}>
      <div class={[
        @variant == :scanner && "mx-auto flex min-h-full w-full max-w-5xl flex-col",
        @variant != :scanner && "mx-auto max-w-2xl space-y-4"
      ]}>
        {render_slot(@inner_block)}
      </div>
    </main>

    <.flash_group flash={@flash} />
    """
  end

  @doc """
  Shows the flash group with standard titles and content.

  ## Examples

      <.flash_group flash={@flash} />
  """
  attr :flash, :map, required: true, doc: "the map of flash messages"
  attr :id, :string, default: "flash-group", doc: "the optional id of flash container"

  def flash_group(assigns) do
    ~H"""
    <div id={@id} aria-live="polite">
      <.flash kind={:info} flash={@flash} />
      <.flash kind={:error} flash={@flash} />

      <.flash
        id="client-error"
        kind={:error}
        title={gettext("We can't find the internet")}
        auto_dismiss={false}
        phx-disconnected={
          show(".phx-client-error #client-error")
          |> JS.remove_attribute("hidden", to: ".phx-client-error #client-error")
        }
        phx-connected={hide("#client-error") |> JS.set_attribute({"hidden", ""})}
        hidden
      >
        {gettext("Attempting to reconnect")}
        <.icon name="hero-arrow-path" class="ml-1 size-3 motion-safe:animate-spin" />
      </.flash>

      <.flash
        id="server-error"
        kind={:error}
        title={gettext("Something went wrong!")}
        auto_dismiss={false}
        phx-disconnected={
          show(".phx-server-error #server-error")
          |> JS.remove_attribute("hidden", to: ".phx-server-error #server-error")
        }
        phx-connected={hide("#server-error") |> JS.set_attribute({"hidden", ""})}
        hidden
      >
        {gettext("Attempting to reconnect")}
        <.icon name="hero-arrow-path" class="ml-1 size-3 motion-safe:animate-spin" />
      </.flash>
    </div>
    """
  end

  @doc """
  Provides dark vs light theme toggle based on themes defined in app.css.

  See <head> in root.html.heex which applies the theme before page load.
  """
  def theme_toggle(assigns) do
    ~H"""
    <div class="card relative flex flex-row items-center border-2 border-base-300 bg-base-300 rounded-full">
      <div class="absolute w-1/3 h-full rounded-full border-1 border-base-200 bg-base-100 brightness-200 left-0 [[data-theme=light]_&]:left-1/3 [[data-theme=dark]_&]:left-2/3 [[data-theme-source=system]_&]:!left-0 transition-[left]" />

      <button
        class="flex p-2 cursor-pointer w-1/3"
        phx-click={JS.dispatch("phx:set-theme")}
        data-phx-theme="system"
      >
        <.icon name="hero-computer-desktop-micro" class="size-4 opacity-75 hover:opacity-100" />
      </button>

      <button
        class="flex p-2 cursor-pointer w-1/3"
        phx-click={JS.dispatch("phx:set-theme")}
        data-phx-theme="light"
      >
        <.icon name="hero-sun-micro" class="size-4 opacity-75 hover:opacity-100" />
      </button>

      <button
        class="flex p-2 cursor-pointer w-1/3"
        phx-click={JS.dispatch("phx:set-theme")}
        data-phx-theme="dark"
      >
        <.icon name="hero-moon-micro" class="size-4 opacity-75 hover:opacity-100" />
      </button>
    </div>
    """
  end
end
