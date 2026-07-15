defmodule ManavaultWeb.Schema.Catalog.BackupOperations do
  @moduledoc false

  use Absinthe.Schema.Notation
  use Absinthe.Relay.Schema.Notation, :modern

  alias ManavaultWeb.Schema.BackupResolvers

  object :backup_queries do
    field :backup_settings, non_null(:backup_settings) do
      resolve(&BackupResolvers.backup_settings/3)
    end

    field :cloud_backups, non_null(list_of(non_null(:cloud_backup))) do
      resolve(&BackupResolvers.cloud_backups/3)
    end
  end

  object :backup_mutations do
    payload field :update_backup_settings do
      arg(:input, non_null(:backup_settings_input))

      output do
        field :backup_settings, :backup_settings
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &BackupResolvers.update_backup_settings/3,
          :backup_settings
        )
      end)
    end

    payload field :run_cloud_backup do
      output do
        field :cloud_backup, :cloud_backup_result
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &BackupResolvers.run_cloud_backup/3, :cloud_backup)
      end)
    end

    payload field :stage_cloud_restore do
      arg(:id, non_null(:id))

      output do
        field :restore_result, :cloud_restore_result
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &BackupResolvers.stage_cloud_restore/3, :restore_result)
      end)
    end
  end

  defp payload(parent, args, resolution, resolver, field) do
    case resolver.(parent, args, resolution) do
      {:ok, value} when is_map(value) ->
        if Map.has_key?(value, field), do: {:ok, value}, else: {:ok, %{field => value}}

      {:ok, value} ->
        {:ok, %{field => value}}

      other ->
        other
    end
  end
end
