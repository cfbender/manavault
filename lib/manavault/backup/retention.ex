defmodule Manavault.Backup.Retention do
  @moduledoc false

  def prune(%{retention_count: count}, uploaded, backups, delete_fun) when is_integer(count) do
    backups
    |> include_uploaded(uploaded)
    |> Enum.sort_by(&modified_sort_key/1, :desc)
    |> Enum.drop(count)
    |> delete_backups(delete_fun)
  end

  def prune(_settings, _uploaded, _backups, _delete_fun), do: {:ok, %{deleted: []}}

  defp include_uploaded(backups, uploaded) when is_map(uploaded) do
    if Enum.any?(backups, &(&1.id == uploaded.id)) do
      backups
    else
      [uploaded | backups]
    end
  end

  defp include_uploaded(backups, _uploaded), do: backups

  defp modified_sort_key(%{modified_at: %DateTime{} = modified_at}) do
    DateTime.to_unix(modified_at, :microsecond)
  end

  defp modified_sort_key(_backup), do: -1

  defp delete_backups(backups, delete_fun) do
    Enum.reduce(backups, {:ok, []}, fn backup, result ->
      case {result, delete_fun.(backup)} do
        {{:ok, deleted}, :ok} ->
          {:ok, [backup | deleted]}

        {{:ok, deleted}, {:error, reason}} ->
          {:error, [delete_error(backup, reason)], deleted}

        {{:error, errors, deleted}, :ok} ->
          {:error, errors, [backup | deleted]}

        {{:error, errors, deleted}, {:error, reason}} ->
          {:error, [delete_error(backup, reason) | errors], deleted}
      end
    end)
    |> retention_result()
  end

  defp delete_error(backup, reason) do
    "#{backup.name}: #{error_message(reason)}"
  end

  defp retention_result({:ok, deleted}) do
    {:ok, %{deleted: Enum.reverse(deleted)}}
  end

  defp retention_result({:error, errors, deleted}) do
    error_count = length(errors)
    error_backup = pluralize(error_count, "backup", "backups")
    deleted_count = length(deleted)
    deleted_backup = pluralize(deleted_count, "backup was", "backups were")

    {:error,
     "failed to prune #{error_count} old cloud #{error_backup}: #{errors |> Enum.reverse() |> Enum.join("; ")}. " <>
       "#{deleted_count} old cloud #{deleted_backup} deleted before the failure."}
  end

  defp error_message(reason) when is_binary(reason), do: reason
  defp error_message(reason), do: inspect(reason)

  defp pluralize(1, singular, _plural), do: singular
  defp pluralize(_count, _singular, plural), do: plural
end
