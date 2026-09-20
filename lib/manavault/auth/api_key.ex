defmodule Manavault.Auth.ApiKey do
  use Ecto.Schema

  import Ecto.Changeset

  schema "api_keys" do
    field :name, :string
    field :prefix, :string
    field :token_hash, :binary, redact: true
    field :last_used_at, :utc_datetime

    timestamps(type: :utc_datetime)
  end

  def changeset(api_key, attrs) do
    api_key
    |> cast(attrs, [:name, :prefix, :token_hash])
    |> update_change(:name, &String.trim/1)
    |> validate_required([:name, :prefix, :token_hash])
    |> validate_length(:name, min: 1, max: 80)
    |> unique_constraint(:token_hash)
  end
end
