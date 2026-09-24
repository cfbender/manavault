defmodule Manavault.Appearance.Settings do
  @moduledoc false

  use Ecto.Schema

  import Ecto.Changeset

  @palettes ~w(
    claret
    nord
    catppuccin
    tokyonight
    gruvbox
    everforest
    kanagawa
    nightowl
    dracula
    rosepine
    solarized
    monochrome
  )
  @theme_styles ~w(glass classic)

  @primary_key {:id, :integer, autogenerate: false}
  schema "appearance_settings" do
    field :palette, :string, default: "claret"
    field :theme_style, :string, default: "glass"

    timestamps(type: :utc_datetime)
  end

  def palettes, do: @palettes

  def theme_styles, do: @theme_styles

  def changeset(settings, attrs) do
    settings
    |> cast(attrs, [:palette, :theme_style])
    |> validate_required([:palette, :theme_style])
    |> validate_inclusion(:palette, @palettes)
    |> validate_inclusion(:theme_style, @theme_styles)
  end
end
