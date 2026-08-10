defmodule Manavault.Pricing.Settings do
  @moduledoc false

  use Ecto.Schema

  import Ecto.Changeset

  @sources ~w(scryfall tcgplayer cardkingdom manapool)

  @primary_key {:id, :integer, autogenerate: false}
  schema "pricing_settings" do
    field :source, :string, default: "scryfall"

    timestamps(type: :utc_datetime)
  end

  def sources, do: @sources

  def changeset(settings, attrs) do
    settings
    |> cast(attrs, [:source])
    |> validate_required([:source])
    |> validate_inclusion(:source, @sources)
  end
end
