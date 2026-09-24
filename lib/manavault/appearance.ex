defmodule Manavault.Appearance do
  @moduledoc """
  The owner's interface appearance: color palette and surface style.

  ManaVault has a single owner account (one admin password, or no auth at all
  with `MANAVAULT_AUTH_DISABLED=true`), so the owner's appearance lives in a
  singleton row rather than on a user record. The light/dark mode stays per
  device in the browser.
  """

  alias Manavault.Appearance.Settings
  alias Manavault.Repo

  @singleton_id 1

  defdelegate palettes, to: Settings
  defdelegate theme_styles, to: Settings

  @doc """
  The saved appearance, or the defaults when the owner has never changed it.

  Reading never writes, so rendering the app shell stays read-only.
  """
  def settings do
    Repo.get(Settings, @singleton_id) || %Settings{id: @singleton_id}
  end

  @doc """
  Updates the given appearance fields, leaving the others unchanged.
  """
  def update_settings(attrs) when is_map(attrs) do
    settings()
    |> Settings.changeset(attrs)
    |> Repo.insert_or_update()
  end
end
