defmodule Manavault.Catalog.Tokens.Produced do
  @moduledoc """
  The tokens a card creates, resolved through Scryfall's producer → token
  links rather than parsed from Oracle text.
  """

  import Ecto.Query

  alias Manavault.Catalog.{Card, CardToken, Printing}
  alias Manavault.Catalog.Tokens.Items
  alias Manavault.Repo

  @type produced_token :: %{printing: Printing.t(), owned_count: non_neg_integer()}

  @doc """
  A map of card oracle ID => produced tokens for the given cards. Each token
  appears once per card (its newest linked printing, with the card preloaded)
  with how many copies of that token the user owns across all its printings.
  """
  @spec by_oracle_ids([String.t()]) :: %{String.t() => [produced_token()]}
  def by_oracle_ids([]), do: %{}

  def by_oracle_ids(oracle_ids) when is_list(oracle_ids) do
    links = linked_token_printings(oracle_ids)

    owned_counts =
      links
      |> Enum.map(fn {_producer, token} -> token.oracle_id end)
      |> Enum.uniq()
      |> Items.owned_token_counts()

    links
    |> Enum.group_by(fn {producer_oracle_id, _token} -> producer_oracle_id end, fn {_, token} ->
      token
    end)
    |> Map.new(fn {producer_oracle_id, tokens} ->
      {producer_oracle_id, produced_tokens(tokens, owned_counts)}
    end)
  end

  defp linked_token_printings(oracle_ids) do
    Repo.all(
      from link in CardToken,
        join: producer in Printing,
        on: producer.scryfall_id == link.scryfall_id,
        join: token in Printing,
        on: token.scryfall_id == link.token_scryfall_id,
        join: card in assoc(token, :card),
        as: :card,
        where: producer.oracle_id in ^oracle_ids,
        where: ^Card.token(),
        order_by: [desc: token.released_at, asc: token.set_code, asc: token.collector_number],
        select: {producer.oracle_id, token, card}
    )
    |> Enum.map(fn {producer_oracle_id, token, card} ->
      {producer_oracle_id, %{token | card: card}}
    end)
  end

  # Newest printing per token card, in a stable alphabetical order.
  defp produced_tokens(printings, owned_counts) do
    printings
    |> Enum.uniq_by(& &1.oracle_id)
    |> Enum.sort_by(&{&1.card.name, &1.oracle_id})
    |> Enum.map(&%{printing: &1, owned_count: Map.get(owned_counts, &1.oracle_id, 0)})
  end
end
