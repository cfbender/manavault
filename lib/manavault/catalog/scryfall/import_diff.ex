defmodule Manavault.Catalog.Scryfall.ImportDiff do
  @moduledoc """
  Narrows a batch of import rows to the ones whose stored data differs.

  Most of the catalog is identical from one daily bulk file to the next, and
  every row the import skips is a row (and its index entries) SQLite never has
  to rewrite while holding the database-wide write lock. The reads here run
  outside the batch transaction: under WAL they never block, or wait for, a
  writer.
  """

  import Ecto.Query

  alias Manavault.Catalog.{Card, CardToken, Printing}
  alias Manavault.Catalog.Scryfall.ImportRows
  alias Manavault.Repo

  @lookup_batch_size 200

  # rulings_uri embeds the printing id, so every printing of a card carries a
  # different one. They all return the same oracle-level rulings, so a card row
  # that differs only there is not worth rewriting.
  @card_fields_ignored_in_diff [:rulings_uri]

  @type t :: %{
          cards: [map()],
          printings: [map()],
          relinked_scryfall_ids: [String.t()],
          card_tokens: [map()]
        }

  @doc """
  Returns the card and printing rows that differ from what is stored, plus the
  printings whose token links changed together with their new link rows.
  """
  @spec changes(ImportRows.t(), boolean()) :: t()
  def changes(rows, replace_oracle_tag_fields?) do
    card_fields =
      ImportRows.card_fields(replace_oracle_tag_fields?) -- @card_fields_ignored_in_diff

    %{
      cards: changed_rows(rows.cards, Card, :oracle_id, card_fields),
      printings:
        changed_rows(rows.printings, Printing, :scryfall_id, ImportRows.printing_fields())
    }
    |> Map.merge(changed_token_links(rows.printings, rows.card_tokens))
  end

  defp changed_rows([], _schema, _key, _fields), do: []

  defp changed_rows(rows, schema, key, fields) do
    stored = stored_rows(schema, key, Enum.map(rows, &Map.fetch!(&1, key)), fields)

    Enum.reject(rows, fn row ->
      case Map.fetch(stored, Map.fetch!(row, key)) do
        {:ok, stored_row} -> Map.take(row, fields) == stored_row
        :error -> false
      end
    end)
  end

  defp stored_rows(schema, key, ids, fields) do
    selected = [key | fields]

    ids
    |> Enum.uniq()
    |> Enum.chunk_every(@lookup_batch_size)
    |> Enum.flat_map(fn chunk ->
      Repo.all(
        from row in schema,
          where: field(row, ^key) in ^chunk,
          select: map(row, ^selected)
      )
    end)
    |> Map.new(fn stored -> {Map.fetch!(stored, key), Map.delete(stored, key)} end)
  end

  # Token links are compared per printing as sets, so a printing is relinked
  # (its links deleted and reinserted) only when Scryfall added or dropped one.
  defp changed_token_links(printing_rows, token_rows) do
    scryfall_ids =
      Enum.uniq(
        Enum.map(printing_rows, & &1.scryfall_id) ++ Enum.map(token_rows, & &1.scryfall_id)
      )

    stored = stored_token_links(scryfall_ids)
    incoming = Enum.group_by(token_rows, & &1.scryfall_id, & &1.token_scryfall_id)

    relinked =
      Enum.filter(scryfall_ids, fn scryfall_id ->
        MapSet.new(Map.get(stored, scryfall_id, [])) !=
          MapSet.new(Map.get(incoming, scryfall_id, []))
      end)

    relinked_set = MapSet.new(relinked)

    %{
      relinked_scryfall_ids: relinked,
      card_tokens: Enum.filter(token_rows, &MapSet.member?(relinked_set, &1.scryfall_id))
    }
  end

  defp stored_token_links([]), do: %{}

  defp stored_token_links(scryfall_ids) do
    scryfall_ids
    |> Enum.chunk_every(@lookup_batch_size)
    |> Enum.flat_map(fn chunk ->
      Repo.all(
        from link in CardToken,
          where: link.scryfall_id in ^chunk,
          select: {link.scryfall_id, link.token_scryfall_id}
      )
    end)
    |> Enum.group_by(&elem(&1, 0), &elem(&1, 1))
  end
end
