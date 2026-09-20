defmodule Manavault.Catalog.Collection.AutoSort.Apply do
  @moduledoc false

  alias Manavault.Catalog.Collection.AutoSort.{Query, RuleMatcher}
  alias Manavault.Catalog.CollectionItem
  alias Manavault.Repo

  @batch_size 100

  def run(query, rules, dry_run?) do
    apply_batches(query, rules, dry_run?, 0, empty_result(dry_run?))
  end

  defp apply_batches(query, rules, dry_run?, after_id, result) do
    case apply_batch(query, rules, dry_run?, after_id, result) do
      {:ok, {[], result}} ->
        {:ok, %{result | moves: Enum.reverse(result.moves)}}

      {:ok, {items, result}} ->
        apply_batches(query, rules, dry_run?, List.last(items).id, result)

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp apply_batch(query, rules, dry_run?, after_id, result) do
    Repo.transaction(fn ->
      items = Query.batch(query, after_id, @batch_size)
      result = Enum.reduce(items, result, &apply_item(&1, &2, rules, dry_run?))
      {items, %{result | checked_count: result.checked_count + length(items)}}
    end)
  end

  defp apply_item(item, result, rules, dry_run?) do
    case RuleMatcher.matching_rule(rules, item) do
      nil ->
        increment(result, :skipped_count)

      %{location_id: location_id} when location_id == item.location_id ->
        increment(result, :skipped_count)

      rule ->
        unless dry_run?, do: update_location(item, rule.location_id)

        result
        |> increment(:moved_count)
        |> Map.update!(:moves, &[RuleMatcher.move_summary(item, rule) | &1])
    end
  end

  defp update_location(item, location_id) do
    item
    |> CollectionItem.update_changeset(%{location_id: location_id})
    |> Repo.update()
    |> case do
      {:ok, _item} -> :ok
      {:error, changeset} -> Repo.rollback(changeset)
    end
  end

  defp increment(result, key), do: Map.update!(result, key, &(&1 + 1))

  defp empty_result(dry_run?),
    do: %{checked_count: 0, moved_count: 0, skipped_count: 0, dry_run: dry_run?, moves: []}
end
