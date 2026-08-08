defmodule Manavault.Repo.Migrations.AddNormalizedCardNames do
  use Ecto.Migration

  import Ecto.Query

  @batch_size 250

  def up do
    alter table(:scryfall_cards) do
      add :normalized_name, :string
    end

    flush()
    backfill_normalized_names()

    create index(:scryfall_cards, [:normalized_name])
  end

  def down do
    drop index(:scryfall_cards, [:normalized_name])

    alter table(:scryfall_cards) do
      remove :normalized_name
    end
  end

  defp backfill_normalized_names do
    repo().all(from(card in "scryfall_cards", select: {card.oracle_id, card.name}))
    |> Enum.chunk_every(@batch_size)
    |> Enum.each(&backfill_batch/1)
  end

  defp backfill_batch(cards) do
    cases = Enum.map_join(cards, " ", fn _card -> "WHEN ? THEN ?" end)
    ids = Enum.map(cards, &elem(&1, 0))
    placeholders = Enum.map_join(ids, ", ", fn _id -> "?" end)

    params =
      Enum.flat_map(cards, fn {oracle_id, name} -> [oracle_id, normalize_name(name)] end) ++ ids

    repo().query!(
      "UPDATE scryfall_cards SET normalized_name = CASE oracle_id #{cases} END " <>
        "WHERE oracle_id IN (#{placeholders})",
      params
    )
  end

  defp normalize_name(name) do
    name
    |> String.normalize(:nfd)
    |> String.replace(~r/\p{M}+/u, "")
    |> String.downcase()
    |> String.replace(~r/['\x{2019}]/u, "")
    |> String.replace(~r/\s+/u, " ")
    |> String.trim()
  end
end
