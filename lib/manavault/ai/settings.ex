defmodule Manavault.AI.Settings do
  use Ecto.Schema

  import Ecto.Changeset

  @primary_key {:id, :integer, autogenerate: false}
  schema "ai_settings" do
    field :provider, :string, default: "openrouter"
    field :api_key, Manavault.Encrypted.Binary
    field :model, :string

    timestamps(type: :utc_datetime)
  end

  @providers ~w(openrouter)

  def changeset(settings, attrs) do
    settings
    |> cast(attrs, [:provider, :api_key, :model])
    |> normalize_strings()
    |> validate_required([:provider, :api_key, :model])
    |> validate_inclusion(:provider, @providers)
    |> validate_length(:model, max: 200)
  end

  def secret_present?(%__MODULE__{api_key: api_key}) do
    is_binary(api_key) and String.trim(api_key) != ""
  end

  defp normalize_strings(changeset) do
    Enum.reduce([:provider, :api_key, :model], changeset, fn field, changeset ->
      case get_change(changeset, field) do
        value when is_binary(value) ->
          value = String.trim(value)
          put_change(changeset, field, if(value == "", do: nil, else: value))

        _value ->
          changeset
      end
    end)
  end
end
