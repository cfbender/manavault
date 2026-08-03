defmodule Manavault.Trade.WantsShare do
  @moduledoc """
  The public wants-list share: a single token gating a read-only
  `wantsList` view of every trade want (see `ManavaultWeb.PublicShareSchema`
  and the `/share/wants/:token` route). Unlike deck sharing, there is
  exactly one wants share for the whole collection — generated lazily and
  reused for its lifetime, instead of one token per row. Token format is
  reused from `Manavault.Catalog.Decks.ShareToken`.
  """

  use Ecto.Schema

  import Ecto.Changeset
  import Ecto.Query

  alias Manavault.Catalog.Decks.ShareToken
  alias Manavault.Catalog.Printing
  alias Manavault.Repo
  alias Manavault.Trade
  alias Manavault.Trade.Want

  @share_token_attempts 5

  schema "trade_want_shares" do
    field :token, :string

    timestamps(type: :utc_datetime)
  end

  def changeset(wants_share, attrs) do
    wants_share
    |> cast(attrs, [:token])
    |> validate_required([:token])
    |> unique_constraint(:token)
  end

  @doc "The current wants share token, or `nil` if one has never been created."
  def token do
    case earliest_share() do
      %__MODULE__{token: token} -> token
      nil -> nil
    end
  end

  @doc """
  Returns the wants share token, creating the singleton row on first use.
  The transaction serializes this operation with disable and rotation so an
  in-flight ensure cannot recreate sharing after revocation.
  """
  def ensure_token do
    Repo.transact(fn ->
      case token() do
        token when is_binary(token) -> {:ok, token}
        nil -> put_token()
      end
    end)
  end

  @doc "Disables sharing and removes every stale singleton row."
  def disable do
    Repo.transact(fn ->
      {count, _} = Repo.delete_all(__MODULE__)
      {:ok, count}
    end)
  end

  @doc "Replaces every share row with exactly one fresh canonical token."
  def rotate, do: rotate(@share_token_attempts)

  @doc """
  The public wants list for `share_token`, or `nil` when it's malformed or
  doesn't match the stored share token.
  """
  def list_by_token(share_token) do
    if ShareToken.valid?(share_token) and share_token == token() do
      %{entries: entries()}
    end
  end

  defp put_token do
    %__MODULE__{}
    |> changeset(%{token: ShareToken.generate()})
    |> Repo.insert()
    |> case do
      {:ok, %__MODULE__{}} ->
        {:ok, canonical_token()}

      {:error, changeset} ->
        if Keyword.has_key?(changeset.errors, :token) do
          {:ok, canonical_token()}
        else
          {:error, changeset}
        end
    end
  end

  defp rotate(0), do: {:error, :share_token_collision}

  defp rotate(attempts) do
    Repo.transact(fn ->
      Repo.delete_all(__MODULE__)

      case %__MODULE__{} |> changeset(%{token: ShareToken.generate()}) |> Repo.insert() do
        {:ok, %__MODULE__{token: token}} -> {:ok, token}
        {:error, changeset} -> Repo.rollback(changeset)
      end
    end)
    |> case do
      {:error, %Ecto.Changeset{} = changeset} ->
        if Keyword.has_key?(changeset.errors, :token),
          do: rotate(attempts - 1),
          else: {:error, changeset}

      result ->
        result
    end
  end

  defp canonical_token do
    %__MODULE__{token: token} = earliest_share()
    token
  end

  defp earliest_share do
    __MODULE__
    |> order_by(asc: :id)
    |> limit(1)
    |> Repo.one()
  end

  defp entries do
    Want
    |> preload([:card, :preferred_printing])
    |> order_by([w], asc: w.id)
    |> Repo.all()
    |> Enum.map(&entry/1)
  end

  defp entry(%Want{card: card, quantity: quantity, preferred_printing: printing} = want) do
    {set_code, collector_number} = printing_identity(printing)

    %{
      card_name: card.name,
      quantity: quantity,
      type_line: card.type_line,
      set_code: set_code,
      collector_number: collector_number,
      image_url: Trade.want_image_url(want)
    }
  end

  defp printing_identity(%Printing{set_code: set_code, collector_number: collector_number}),
    do: {set_code, collector_number}

  defp printing_identity(_no_preferred_printing), do: {nil, nil}
end
