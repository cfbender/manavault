defmodule Manavault.Auth.ApiKeys do
  @moduledoc """
  Personal, read-only API keys for the owner of a ManaVault instance.

  ManaVault has one instance owner rather than user records, so every key is
  implicitly owned by that instance owner. Plaintext keys are returned only by
  `create/1`; only a SHA-256 digest is persisted.
  """

  import Ecto.Query

  alias Manavault.Auth.ApiKey
  alias Manavault.Repo

  @token_prefix "mvk_"
  @random_bytes 32
  @display_prefix_length 12

  def list do
    ApiKey
    |> order_by([key], desc: key.inserted_at, desc: key.id)
    |> Repo.all()
  end

  def create(name) when is_binary(name) do
    token =
      @token_prefix <> Base.url_encode64(:crypto.strong_rand_bytes(@random_bytes), padding: false)

    attrs = %{
      name: name,
      prefix: String.slice(token, 0, @display_prefix_length),
      token_hash: hash(token)
    }

    case %ApiKey{} |> ApiKey.changeset(attrs) |> Repo.insert() do
      {:ok, api_key} -> {:ok, api_key, token}
      {:error, changeset} -> {:error, changeset}
    end
  end

  def create(_name), do: {:error, :invalid_name}

  def authenticate(token) when is_binary(token) do
    with true <- valid_format?(token),
         %ApiKey{} = api_key <- Repo.get_by(ApiKey, token_hash: hash(token)) do
      now = DateTime.utc_now(:second)

      from(key in ApiKey, where: key.id == ^api_key.id)
      |> Repo.update_all(set: [last_used_at: now, updated_at: now])

      {:ok, %{api_key | last_used_at: now, updated_at: now}}
    else
      _ -> :error
    end
  end

  def authenticate(_token), do: :error

  def revoke(id) do
    case Repo.get(ApiKey, id) do
      nil -> {:error, :not_found}
      api_key -> Repo.delete(api_key)
    end
  end

  def hash(token) when is_binary(token), do: :crypto.hash(:sha256, token)

  defp valid_format?(token) do
    String.starts_with?(token, @token_prefix) and byte_size(token) == 47
  end
end
