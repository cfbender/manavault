defmodule Manavault.Repo.Migrations.BackfillDeckDefaultTags do
  use Ecto.Migration

  import Ecto.Query

  def up do
    flush()

    now = DateTime.utc_now() |> DateTime.truncate(:second)

    defaults =
      repo().all(
        from(t in "default_deck_tags",
          order_by: [asc: t.position],
          select: %{name: t.name, color: t.color, target_count: t.target_count, position: t.position}
        )
      )

    tagged_deck_ids =
      repo().all(from(t in "deck_tags", distinct: true, select: t.deck_id))

    untagged_deck_ids =
      repo().all(
        from(d in "decks", where: d.id not in ^tagged_deck_ids, select: d.id)
      )

    rows =
      for deck_id <- untagged_deck_ids, default <- defaults do
        Map.merge(default, %{deck_id: deck_id, inserted_at: now, updated_at: now})
      end

    if rows != [] do
      repo().insert_all("deck_tags", rows)
    end
  end

  def down do
    # Data backfill only; cannot distinguish backfilled tags from user-created ones.
    :ok
  end
end
