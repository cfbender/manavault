defmodule ManavaultWeb.Schema.BackupResolvers do
  alias Manavault.Backup
  alias Manavault.Backup.Settings

  def backup_settings(_parent, _args, _resolution) do
    {:ok, Backup.settings() |> Settings.sanitize() |> serialize_datetimes()}
  end

  def cloud_backups(_parent, _args, _resolution) do
    case Backup.list_cloud_backups() do
      {:ok, backups} -> {:ok, Enum.map(backups, &serialize_datetimes/1)}
      {:error, reason} -> {:error, error_message(reason)}
    end
  end

  def update_backup_settings(_parent, %{input: input}, _resolution) do
    case Backup.update_settings(input) do
      {:ok, settings} -> {:ok, settings |> Settings.sanitize() |> serialize_datetimes()}
      {:error, changeset} -> {:error, changeset_error_message(changeset)}
    end
  end

  def run_cloud_backup(_parent, _args, _resolution) do
    case Backup.run_cloud_backup() do
      {:ok, remote} ->
        {:ok,
         remote
         |> serialize_datetimes()
         |> Map.merge(%{status: "ok", message: "Backup uploaded."})}

      {:error, reason} ->
        {:error, error_message(reason)}
    end
  end

  def stage_cloud_restore(_parent, %{id: id}, _resolution) do
    case Backup.stage_cloud_restore(id) do
      {:ok, result} -> {:ok, result}
      {:error, reason} -> {:error, error_message(reason)}
    end
  end

  defp serialize_datetimes(map) when is_map(map) do
    Map.new(map, fn
      {key, %DateTime{} = value} -> {key, DateTime.to_iso8601(value)}
      {key, value} -> {key, value}
    end)
  end

  defp error_message(reason) when is_binary(reason), do: reason
  defp error_message(reason), do: inspect(reason)

  defp changeset_error_message(changeset) do
    changeset
    |> Ecto.Changeset.traverse_errors(fn {message, opts} ->
      Enum.reduce(opts, message, fn {key, value}, acc ->
        String.replace(acc, "%{#{key}}", to_string(value))
      end)
    end)
    |> Enum.map_join(", ", fn {field, messages} -> "#{field} #{Enum.join(messages, ", ")}" end)
  end
end
