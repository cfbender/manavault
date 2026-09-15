defmodule Manavault.Trade.WantsShare do
  @moduledoc """
  The public wants-list share: a single token gating a read-only
  `wantsList` view of every trade want (see `ManavaultWeb.PublicShareSchema`
  and the `/share/wants/:token` route). Unlike deck sharing, there is
  exactly one wants share for the whole collection — generated lazily and
  reused for its lifetime, instead of one token per row. The token
  lifecycle lives in `Manavault.Trade.SingletonShare`.
  """

  use Ecto.Schema

  import Ecto.Changeset
  import Ecto.Query

  alias Manavault.Catalog.Printing
  alias Manavault.Repo
  alias Manavault.Trade
  alias Manavault.Trade.{SingletonShare, Want}

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

  def token, do: SingletonShare.token(__MODULE__)
  def ensure_token, do: SingletonShare.ensure_token(__MODULE__)
  def disable, do: SingletonShare.disable(__MODULE__)
  def rotate, do: SingletonShare.rotate(__MODULE__)

  @doc """
  The public wants list for `share_token`, or `nil` when it's malformed or
  doesn't match the stored share token.
  """
  def list_by_token(share_token) do
    if SingletonShare.matches?(__MODULE__, share_token) do
      %{entries: entries()}
    end
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
