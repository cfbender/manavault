defmodule Manavault.Auth.ClientFailure do
  @moduledoc false

  use Ecto.Schema

  import Ecto.Changeset

  schema "auth_client_failures" do
    field :client_id, :string
    field :failed_attempts, :integer, default: 0
    field :banned_at, :utc_datetime

    timestamps(type: :utc_datetime)
  end

  def changeset(client_failure, attrs) do
    client_failure
    |> cast(attrs, [:client_id, :failed_attempts, :banned_at])
    |> validate_required([:client_id, :failed_attempts])
    |> validate_number(:failed_attempts, greater_than_or_equal_to: 0)
    |> unique_constraint(:client_id)
  end
end
