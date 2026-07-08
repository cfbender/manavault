defmodule Manavault.Catalog.DefaultDeckTag do
  use Ecto.Schema

  import Ecto.Changeset

  schema "default_deck_tags" do
    field :name, :string
    field :color, :string
    field :target_count, :integer
    field :position, :integer, default: 0

    timestamps(type: :utc_datetime)
  end

  def changeset(default_deck_tag, attrs) do
    default_deck_tag
    |> cast(attrs, [:name, :color, :target_count, :position])
    |> validate_required([:name, :color])
    |> validate_length(:name, min: 1, max: 60)
    |> validate_format(:color, ~r/^#[0-9a-fA-F]{6}$/)
    |> validate_number(:target_count, greater_than: 0)
    |> unique_constraint([:name])
  end
end
