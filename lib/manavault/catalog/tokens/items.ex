defmodule Manavault.Catalog.Tokens.Items do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, Printing, TokenItem, Util}
  alias Manavault.Catalog.Search.NameMatch
  alias Manavault.Repo

  @preloads [printing: :card, back_printing: :card]

  @doc "Owned tokens, alphabetically by token name; `:q` filters by name."
  def list(filters \\ []) when is_list(filters) do
    name = filters |> Keyword.get(:q, "") |> Util.normalize_filter()

    TokenItem
    |> join(:inner, [item], printing in assoc(item, :printing), as: :printing)
    |> join(:inner, [printing: printing], card in assoc(printing, :card), as: :card)
    |> join(:left, [item], back in assoc(item, :back_printing), as: :back_printing)
    |> join(:left, [back_printing: back], back_card in assoc(back, :card), as: :back_card)
    |> maybe_filter_name(name)
    |> order_by([item, printing: printing, card: card],
      asc: card.name,
      asc: printing.set_code,
      asc: printing.collector_number,
      asc: item.id
    )
    |> preload(^@preloads)
    |> Repo.all()
  end

  def get!(id) do
    TokenItem
    |> Repo.get!(id)
    |> Repo.preload(@preloads)
  end

  @doc "Total owned token copies across every token item."
  def count do
    Repo.one(from(item in TokenItem, select: coalesce(sum(item.quantity), 0)))
  end

  @doc """
  Records owned copies of a token printing. Copies of the same printing, back
  face, and finish merge into one row by adding to its quantity.
  """
  def add(attrs) when is_map(attrs) do
    attrs = normalize(attrs)

    with {:ok, _printing} <- fetch_token_printing(Map.get(attrs, "scryfall_id")),
         :ok <- validate_back(Map.get(attrs, "back_scryfall_id")) do
      Repo.transact(fn -> insert_or_merge(attrs) end) |> preload_result()
    end
  end

  defp insert_or_merge(attrs) do
    case Repo.one(matching_item_query(attrs)) do
      nil ->
        %TokenItem{} |> TokenItem.changeset(attrs) |> Repo.insert()

      %TokenItem{} = item ->
        quantity = item.quantity + Map.get(attrs, "quantity", 1)
        item |> TokenItem.changeset(%{"quantity" => quantity}) |> Repo.update()
    end
  end

  def update(%TokenItem{} = item, attrs) when is_map(attrs) do
    item
    |> TokenItem.changeset(normalize(attrs))
    |> Repo.update()
    |> preload_result()
  end

  def delete(%TokenItem{} = item), do: Repo.delete(item)

  @doc """
  Owned copies per token card (oracle ID), counting any printing of the token
  and both faces of a double-sided token.
  """
  def owned_token_counts([]), do: %{}

  def owned_token_counts(oracle_ids) when is_list(oracle_ids) do
    front =
      from(item in TokenItem,
        join: printing in assoc(item, :printing),
        where: printing.oracle_id in ^oracle_ids,
        group_by: printing.oracle_id,
        select: {printing.oracle_id, sum(item.quantity)}
      )

    back =
      from(item in TokenItem,
        join: printing in assoc(item, :back_printing),
        where: printing.oracle_id in ^oracle_ids,
        group_by: printing.oracle_id,
        select: {printing.oracle_id, sum(item.quantity)}
      )

    [front, back]
    |> Enum.flat_map(&Repo.all/1)
    |> Enum.reduce(%{}, fn {oracle_id, count}, counts ->
      Map.update(counts, oracle_id, count, &(&1 + count))
    end)
  end

  defp maybe_filter_name(query, ""), do: query

  # Either printed side of the token matches the name filter.
  defp maybe_filter_name(query, name) do
    pattern = NameMatch.like_pattern(name)

    where(
      query,
      [card: card, back_card: back_card],
      fragment("? LIKE ? ESCAPE '\\'", card.normalized_name, ^pattern) or
        fragment("? LIKE ? ESCAPE '\\'", back_card.normalized_name, ^pattern)
    )
  end

  defp matching_item_query(attrs) do
    scryfall_id = Map.get(attrs, "scryfall_id")
    finish = Map.get(attrs, "finish", "nonfoil")

    query =
      from(item in TokenItem,
        where: item.scryfall_id == ^scryfall_id and item.finish == ^finish,
        limit: 1
      )

    case Map.get(attrs, "back_scryfall_id") do
      nil -> where(query, [item], is_nil(item.back_scryfall_id))
      back_id -> where(query, [item], item.back_scryfall_id == ^back_id)
    end
  end

  defp fetch_token_printing(scryfall_id) when is_binary(scryfall_id) do
    case Repo.get(Printing, scryfall_id) |> Repo.preload(:card) do
      %Printing{card: %Card{} = card} = printing ->
        if Card.token?(card), do: {:ok, printing}, else: {:error, :not_a_token}

      nil ->
        {:error, :printing_not_found}
    end
  end

  defp fetch_token_printing(_scryfall_id), do: {:error, :printing_not_found}

  defp validate_back(nil), do: :ok

  defp validate_back(back_scryfall_id) do
    with {:ok, _printing} <- fetch_token_printing(back_scryfall_id), do: :ok
  end

  # Only keys that were given are normalized, so an update without `quantity`
  # leaves the stored quantity alone.
  defp normalize(attrs) do
    attrs
    |> Map.new(fn {key, value} -> {to_string(key), value} end)
    |> Map.replace_lazy("back_scryfall_id", &blank_to_nil/1)
    |> Map.replace_lazy("finish", &blank_to_default(&1, "nonfoil"))
    |> Map.replace_lazy("quantity", &Util.parse_quantity/1)
  end

  defp blank_to_nil(value) when value in [nil, ""], do: nil
  defp blank_to_nil(value), do: value

  defp blank_to_default(value, default) when value in [nil, ""], do: default
  defp blank_to_default(value, _default), do: value

  defp preload_result({:ok, item}), do: {:ok, Repo.preload(item, @preloads, force: true)}
  defp preload_result(other), do: other
end
