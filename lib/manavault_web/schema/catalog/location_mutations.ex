defmodule ManavaultWeb.Schema.Catalog.LocationMutations do
  @moduledoc false

  alias Manavault.Catalog
  alias Manavault.Catalog.Location
  alias Manavault.Repo
  alias ManavaultWeb.Schema.Catalog.Errors
  alias ManavaultWeb.Schema.RelayHelpers

  def create_location(_parent, %{input: input}, resolution) do
    with {:ok, input} <- normalize_location_input(input, resolution) do
      case Catalog.create_location(input) do
        {:ok, location} -> {:ok, Repo.preload(location, cover_printing: :card)}
        {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
      end
    end
  end

  def delete_location(_parent, %{id: id}, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :location, resolution) do
      if id == "unfiled" do
        {:error, "Unfiled cannot be deleted"}
      else
        delete_persisted_location(id)
      end
    end
  end

  def update_location(_parent, %{id: id, input: input}, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :location, resolution),
         {:ok, input} <- normalize_location_input(input, resolution) do
      if id == "unfiled" do
        {:error, "Unfiled cannot be edited"}
      else
        update_persisted_location(id, input)
      end
    end
  end

  def update_collection_auto_sort_rules(_parent, %{input: inputs}, resolution) do
    with {:ok, inputs} <- normalize_auto_sort_rule_inputs(inputs, resolution) do
      case Catalog.update_collection_auto_sort_rules(inputs) do
        {:ok, rules} ->
          {:ok, %{collection_auto_sort_rules: rules, rules: rules}}

        {:error, changeset} when is_struct(changeset, Ecto.Changeset) ->
          {:error, Errors.changeset_error_message(changeset)}

        {:error, reason} ->
          {:error, auto_sort_error(reason)}
      end
    end
  end

  def auto_sort_collection(_parent, args, resolution) do
    with {:ok, opts} <- auto_sort_opts(Map.get(args, :input), resolution) do
      case Catalog.auto_sort_collection(opts) do
        {:ok, result} -> {:ok, result}
        {:error, reason} -> {:error, auto_sort_error(reason)}
      end
    end
  end

  defp delete_persisted_location(id) do
    location = Catalog.get_location!(id)

    case Catalog.delete_location(location) do
      {:ok, location} -> {:ok, Repo.preload(location, cover_printing: :card)}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end

  defp update_persisted_location(id, input) do
    location = Catalog.get_location!(id)

    case Catalog.update_location(location, input) do
      {:ok, location} -> {:ok, Repo.preload(location, cover_printing: :card)}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end

  defp normalize_location_input(input, resolution) do
    RelayHelpers.put_optional_node_id(input, :cover_scryfall_id, :printing, resolution)
  end

  defp normalize_auto_sort_rule_inputs(inputs, resolution) do
    inputs
    |> Enum.reduce_while({:ok, []}, fn input, {:ok, parsed_inputs} ->
      case normalize_auto_sort_rule_input(input, resolution) do
        {:ok, parsed_input} -> {:cont, {:ok, [parsed_input | parsed_inputs]}}
        {:error, message} -> {:halt, {:error, message}}
      end
    end)
    |> case do
      {:ok, parsed_inputs} -> {:ok, Enum.reverse(parsed_inputs)}
      {:error, message} -> {:error, message}
    end
  end

  defp normalize_auto_sort_rule_input(input, resolution) do
    with {:ok, target_location_id} <- location_id(input.target_location_id, resolution),
         :ok <- validate_auto_sort_target(target_location_id) do
      {:ok, Map.put(input, :target_location_id, target_location_id)}
    end
  end

  defp validate_auto_sort_target("unfiled"),
    do: {:error, "Unfiled cannot be an auto-sort target."}

  defp validate_auto_sort_target(target_location_id) do
    case Repo.get(Location, target_location_id) do
      %Location{kind: kind} when kind in ["box", "binder"] -> :ok
      %Location{} -> {:error, "Auto-sort target must be a box or binder."}
      nil -> {:error, "Auto-sort target location was not found."}
    end
  end

  defp auto_sort_opts(nil, _resolution), do: {:ok, []}

  defp auto_sort_opts(input, resolution) do
    with {:ok, source_location_id} <-
           optional_location_id(Map.get(input, :source_location_id), resolution),
         {:ok, rules} <- optional_auto_sort_rule_inputs(Map.get(input, :rules), resolution) do
      opts = [source_location_id: source_location_id, dry_run: Map.get(input, :dry_run) == true]

      {:ok, if(is_nil(rules), do: opts, else: Keyword.put(opts, :rules, rules))}
    end
  end

  defp optional_auto_sort_rule_inputs(nil, _resolution), do: {:ok, nil}

  defp optional_auto_sort_rule_inputs(rules, resolution),
    do: normalize_auto_sort_rule_inputs(rules, resolution)

  defp optional_location_id(nil, _resolution), do: {:ok, nil}
  defp optional_location_id("", _resolution), do: {:ok, nil}
  defp optional_location_id(id, resolution), do: location_id(id, resolution)

  defp location_id("unfiled", _resolution), do: {:ok, "unfiled"}
  defp location_id(id, resolution), do: RelayHelpers.node_id(id, :location, resolution)

  defp auto_sort_error(reason) when is_binary(reason), do: reason
  defp auto_sort_error(:location_not_found), do: "Auto-sort source location was not found."

  defp auto_sort_error(:auto_sort_target_not_found),
    do: "Auto-sort target location was not found."

  defp auto_sort_error(:invalid_auto_sort_target), do: "Auto-sort target must be a box or binder."
  defp auto_sort_error(_reason), do: "Could not auto-sort collection."
end
