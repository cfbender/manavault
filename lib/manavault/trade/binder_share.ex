defmodule Manavault.Trade.BinderShare do
  @moduledoc """
  The public trade-binder share: a single token gating a read-only
  `binderList` view of every for-trade collection item (see
  `ManavaultWeb.PublicShareSchema` and the `/share/binder/:token` route).
  Unlike deck sharing, there is exactly one binder share for the whole
  collection — generated lazily and reused for its lifetime, instead of
  one token per row. The token lifecycle lives in
  `Manavault.Trade.SingletonShare`.
  """

  use Ecto.Schema

  import Ecto.Changeset
  import Ecto.Query

  alias Manavault.Catalog.{CollectionItem, Printing, Util}
  alias Manavault.Repo
  alias Manavault.Trade.{ForTradeQuery, SingletonShare}

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

  def token, do: SingletonShare.token(__MODULE__)
  def ensure_token, do: SingletonShare.ensure_token(__MODULE__)
  def disable, do: SingletonShare.disable(__MODULE__)
  def rotate, do: SingletonShare.rotate(__MODULE__)

  @doc """
  The public trade binder for `share_token`, or `nil` when it's malformed
  or doesn't match the stored share token.
  """
  def list_by_token(share_token) do
    if SingletonShare.matches?(__MODULE__, share_token) do
      %{entries: entries()}
    end
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
