defmodule Manavault.Repo.Migrations.AddNormalizedFlavorNames do
  use Ecto.Migration

  import Ecto.Query

  @batch_size 250

  def up do
    alter table(:scryfall_printings) do
      add :normalized_flavor_name, :string
    end

    flush()
    backfill_normalized_flavor_names()

    create index(:scryfall_printings, [:normalized_flavor_name])
  end

  def down do
    drop index(:scryfall_printings, [:normalized_flavor_name])

    alter table(:scryfall_printings) do
      remove :normalized_flavor_name
    end
  end

  defp backfill_normalized_flavor_names do
    repo().all(
      from(printing in "scryfall_printings",
        where: not is_nil(printing.flavor_name),
        select: {printing.scryfall_id, printing.flavor_name}
      )
    )
    |> Enum.chunk_every(@batch_size)
    |> Enum.each(&backfill_batch/1)
  end

  defp backfill_batch(printings) do
    cases = Enum.map_join(printings, " ", fn _printing -> "WHEN ? THEN ?" end)
    ids = Enum.map(printings, &elem(&1, 0))
    placeholders = Enum.map_join(ids, ", ", fn _id -> "?" end)

    params =
      Enum.flat_map(printings, fn {scryfall_id, flavor_name} ->
        [scryfall_id, normalize_name(flavor_name)]
      end) ++ ids

    repo().query!(
      "UPDATE scryfall_printings SET normalized_flavor_name = CASE scryfall_id #{cases} END " <>
        "WHERE scryfall_id IN (#{placeholders})",
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
