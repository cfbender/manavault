defmodule Manavault.Pricing.VendorPrice do
  @moduledoc false

  use Ecto.Schema

  @primary_key false
  schema "vendor_prices" do
    field :vendor, :string, primary_key: true
    field :scryfall_id, :string, primary_key: true
    field :finish, :string, primary_key: true
    field :price_cents, :integer

    timestamps(type: :utc_datetime_usec)
  end
end
