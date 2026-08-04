defmodule Manavault.Trade.BinderShare do
  @moduledoc """
  The public trade-binder share: a single token gating a read-only
  `binderList` view of every for-trade collection item (see
  `ManavaultWeb.PublicShareSchema` and the `/share/binder/:token` route).
  Unlike deck sharing, there is exactly one binder share for the whole
  collection — generated lazily and reused for its lifetime, instead of
  one token per row. Token format is reused from
  `Manavault.Catalog.Decks.ShareToken`.
  """

  use Ecto.Schema

  import Ecto.Changeset
  import Ecto.Query

  alias Manavault.Catalog.{CollectionItem, Printing, Util}
  alias Manavault.Catalog.Decks.ShareToken
  alias Manavault.Repo
  alias Manavault.Trade.ForTradeQuery

  @share_token_attempts 5

  schema "trade_binder_shares" do
    field :token, :string

    timestamps(type: :utc_datetime)
  end

  def changeset(binder_share, attrs) do
    binder_share
    |> cast(attrs, [:token])
    |> validate_required([:token])
    |> unique_constraint(:token)
  end

  @doc "The current binder share token, or `nil` if one has never been created."
  def token do
    case earliest_share() do
      %__MODULE__{token: token} -> token
      nil -> nil
    end
  end

  @doc """
  Returns the binder share token, creating the singleton row on first use.
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
  The public trade binder for `share_token`, or `nil` when it's malformed
  or doesn't match the stored share token.
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
    ForTradeQuery.base_query()
    |> preload([_item, printing, card], printing: {printing, card: card})
    |> Repo.all()
    |> aggregate_by_printing()
    |> Enum.sort_by(&{&1.card_name, &1.set_code, &1.collector_number, &1.finish, &1.condition})
  end

  # Aggregates by (printing, finish, condition) rather than SQL GROUP BY —
  # mirrors `Matcher.aggregate_by_oracle/1`, which does the same kind of
  # summing in Elixir after a plain `Repo.all/1`.
  defp aggregate_by_printing(items) do
    items
    |> Enum.reduce(%{}, fn item, aggregates ->
      Map.update(
        aggregates,
        {item.scryfall_id, item.finish, item.condition},
        entry(item),
        fn existing ->
          %{existing | quantity: existing.quantity + item.for_trade_quantity}
        end
      )
    end)
    |> Map.values()
  end

  defp entry(%CollectionItem{printing: %Printing{card: card} = printing} = item) do
    %{
      card_name: card.name,
      quantity: item.for_trade_quantity,
      type_line: card.type_line,
      set_code: printing.set_code,
      collector_number: printing.collector_number,
      image_url: printing_image_url(printing),
      finish: item.finish,
      condition: item.condition
    }
  end

  defp printing_image_url(%Printing{image_uris: image_uris}) do
    image_uris |> Util.decode_json(%{}) |> image_url()
  end

  defp image_url(%{} = image_uris) do
    image_uris["normal"] || image_uris["large"] || image_uris["small"] || image_uris["png"]
  end

  defp image_url([first | _rest]), do: image_url(first)
  defp image_url(_image_uris), do: nil
end
