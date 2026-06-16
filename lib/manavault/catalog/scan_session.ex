defmodule Manavault.Catalog.ScanSession do
  use Ecto.Schema

  import Ecto.Changeset

  schema "scan_sessions" do
    field :name, :string
    field :status, :string, default: "open"
    field :default_condition, :string, default: "near_mint"
    field :default_language, :string, default: "en"
    field :default_finish, :string, default: "nonfoil"

    belongs_to :default_location, Manavault.Catalog.Location,
      foreign_key: :default_location_id,
      on_replace: :nilify

    has_many :scan_items, Manavault.Catalog.ScanItem

    timestamps(type: :utc_datetime)
  end

  @statuses ~w(open reviewing completed archived)
  @conditions ~w(near_mint lightly_played moderately_played heavily_played damaged)
  @finishes ~w(nonfoil foil etched)

  def changeset(scan_session, attrs) do
    scan_session
    |> cast(attrs, [
      :name,
      :status,
      :default_condition,
      :default_language,
      :default_finish,
      :default_location_id
    ])
    |> validate_required([:name, :status, :default_condition, :default_language, :default_finish])
    |> validate_inclusion(:status, @statuses)
    |> validate_inclusion(:default_condition, @conditions)
    |> validate_inclusion(:default_finish, @finishes)
    |> foreign_key_constraint(:default_location_id)
  end
end
