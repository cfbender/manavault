defmodule Manavault.Trade.SingletonShare do
  @moduledoc """
  Shared lifecycle for singleton share tokens (`Manavault.Trade.WantsShare`
  and `Manavault.Trade.BinderShare`): one token row per share kind,
  generated lazily, revoked by deleting every row, rotated with collision
  retry. Each function takes the Ecto schema module owning the row, which
  must have a unique `:token` string field and a `changeset/2`. Token
  format comes from `Manavault.Catalog.Decks.ShareToken`.
  """

  import Ecto.Query

  alias Manavault.Catalog.Decks.ShareToken
  alias Manavault.Repo

  @share_token_attempts 5

  @doc "The current share token, or `nil` if one has never been created."
  def token(schema) do
    case earliest_share(schema) do
      %{token: token} -> token
      nil -> nil
    end
  end

  @doc """
  Returns the share token, creating the singleton row on first use. The
  transaction serializes this operation with disable and rotation so an
  in-flight ensure cannot recreate sharing after revocation.
  """
  def ensure_token(schema) do
    Repo.transact(fn ->
      case token(schema) do
        token when is_binary(token) -> {:ok, token}
        nil -> put_token(schema)
      end
    end)
  end

  @doc "Disables sharing and removes every stale singleton row."
  def disable(schema) do
    Repo.transact(fn ->
      {count, _} = Repo.delete_all(schema)
      {:ok, count}
    end)
  end

  @doc "Replaces every share row with exactly one fresh canonical token."
  def rotate(schema), do: rotate(schema, @share_token_attempts)

  @doc "Whether `share_token` is well-formed and matches the stored token."
  def matches?(schema, share_token) do
    ShareToken.valid?(share_token) and share_token == token(schema)
  end

  defp put_token(schema) do
    schema
    |> insert_token()
    |> case do
      {:ok, _share} ->
        {:ok, canonical_token(schema)}

      {:error, changeset} ->
        if Keyword.has_key?(changeset.errors, :token) do
          {:ok, canonical_token(schema)}
        else
          {:error, changeset}
        end
    end
  end

  defp rotate(_schema, 0), do: {:error, :share_token_collision}

  defp rotate(schema, attempts) do
    Repo.transact(fn ->
      Repo.delete_all(schema)

      case insert_token(schema) do
        {:ok, %{token: token}} -> {:ok, token}
        {:error, changeset} -> Repo.rollback(changeset)
      end
    end)
    |> case do
      {:error, %Ecto.Changeset{} = changeset} ->
        if Keyword.has_key?(changeset.errors, :token),
          do: rotate(schema, attempts - 1),
          else: {:error, changeset}

      result ->
        result
    end
  end

  defp insert_token(schema) do
    schema
    |> struct()
    |> schema.changeset(%{token: ShareToken.generate()})
    |> Repo.insert()
  end

  defp canonical_token(schema) do
    %{token: token} = earliest_share(schema)
    token
  end

  defp earliest_share(schema) do
    schema
    |> order_by(asc: :id)
    |> limit(1)
    |> Repo.one()
  end
end
