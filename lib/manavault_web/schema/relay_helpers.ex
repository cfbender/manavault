defmodule ManavaultWeb.Schema.RelayHelpers do
  @moduledoc false

  alias Absinthe.Relay.Connection
  alias Absinthe.Relay.Node

  @integer_node_types [:collection_item, :deck, :deck_card]

  def connection_from_list(items, args, default_limit \\ nil) when is_list(items) do
    Connection.from_list(items, connection_args(args, default_limit || length(items)))
  end

  def connection_from_slice(items, offset, limit, total_count) when is_list(items) do
    Connection.from_slice(items, offset,
      has_previous_page: offset > 0,
      has_next_page: offset + limit < total_count
    )
  end

  def collection_slice(items, args, total_count, default_limit \\ 100) when is_list(items) do
    with {:ok, offset, limit} <- slice_window(args, total_count, default_limit) do
      Connection.from_slice(items, offset,
        has_previous_page: offset > 0,
        has_next_page: offset + limit < total_count
      )
    end
  end

  def slice_window(args, total_count, default_limit \\ 100) do
    if relay_pagination?(args) do
      args
      |> connection_args(default_limit)
      |> Connection.offset_and_limit_for_query(count: total_count)
    else
      {:ok, integer_arg(args, :offset, 0), integer_arg(args, :limit, default_limit)}
    end
  end

  def fetch_limit(args, default_limit) do
    args = connection_args(args, default_limit)

    with {:ok, _direction, limit} <- Connection.limit(args),
         {:ok, offset} <- Connection.offset(args) do
      {:ok, (offset || 0) + limit}
    end
  end

  def node_id(id, expected_type, resolution) do
    case Node.from_global_id(id, resolution.schema) do
      {:ok, %{type: type, id: internal_id}} ->
        with :ok <- ensure_type(type, expected_type) do
          coerce_node_id(internal_id, expected_type)
        end

      {:error, message} ->
        if node_field_resolution?(resolution) do
          coerce_node_id(id, expected_type)
        else
          {:error, invalid_id_message(expected_type, message)}
        end
    end
  end

  def optional_node_id(nil, _expected_type, _resolution), do: {:ok, nil}
  def optional_node_id("", _expected_type, _resolution), do: {:ok, nil}
  def optional_node_id(id, expected_type, resolution), do: node_id(id, expected_type, resolution)

  def put_node_id_arg(args, key, expected_type, resolution) do
    with {:ok, id} <- node_id(Map.fetch!(args, key), expected_type, resolution) do
      {:ok, Map.put(args, key, id)}
    end
  end

  def put_node_ids_arg(args, key, expected_type, resolution) do
    args
    |> Map.fetch!(key)
    |> Enum.reduce_while({:ok, []}, fn id, {:ok, ids} ->
      case node_id(id, expected_type, resolution) do
        {:ok, parsed_id} -> {:cont, {:ok, [parsed_id | ids]}}
        {:error, message} -> {:halt, {:error, message}}
      end
    end)
    |> case do
      {:ok, ids} -> {:ok, Map.put(args, key, Enum.reverse(ids))}
      {:error, message} -> {:error, message}
    end
  end

  def put_optional_node_id(map, key, expected_type, resolution) do
    case Map.fetch(map, key) do
      {:ok, value} ->
        with {:ok, id} <- optional_node_id(value, expected_type, resolution) do
          {:ok, Map.put(map, key, id)}
        end

      :error ->
        {:ok, map}
    end
  end

  def put_filter_node_id(filters, key, expected_type, resolution) do
    case Keyword.fetch(filters, key) do
      {:ok, value} ->
        with {:ok, id} <- optional_node_id(value, expected_type, resolution) do
          {:ok, Keyword.put(filters, key, id)}
        end

      :error ->
        {:ok, filters}
    end
  end

  defp connection_args(args, nil), do: args

  defp connection_args(args, default_limit) do
    if Map.get(args, :first) || Map.get(args, :last) do
      args
    else
      Map.put(args, :first, integer_arg(args, :limit, default_limit))
    end
  end

  defp relay_pagination?(args) do
    Enum.any?([:first, :last, :after, :before], &Map.has_key?(args, &1))
  end

  defp integer_arg(args, key, default) do
    case Map.get(args, key, default) do
      value when is_integer(value) and value >= 0 -> value
      _other -> default
    end
  end

  defp ensure_type(type, type), do: :ok

  defp ensure_type(type, expected_type) do
    {:error, "Expected #{node_type_name(expected_type)} ID, got #{node_type_name(type)} ID"}
  end

  defp coerce_node_id("unfiled", :location), do: {:ok, "unfiled"}

  defp coerce_node_id(id, :location), do: parse_integer_node_id(id, :location)

  defp coerce_node_id(id, type) when type in @integer_node_types do
    parse_integer_node_id(id, type)
  end

  defp coerce_node_id(id, _type), do: {:ok, id}

  defp parse_integer_node_id(id, _type) when is_integer(id), do: {:ok, id}

  defp parse_integer_node_id(id, type) when is_binary(id) do
    case Integer.parse(id) do
      {parsed, ""} -> {:ok, parsed}
      _other -> {:error, "Invalid internal #{node_type_name(type)} ID"}
    end
  end

  defp node_field_resolution?(%{definition: %{schema_node: %{identifier: :node}}}), do: true
  defp node_field_resolution?(_resolution), do: false

  defp invalid_id_message(_expected_type, "Expected " <> _ = message), do: message

  defp invalid_id_message(expected_type, message) do
    "Invalid #{node_type_name(expected_type)} ID: #{message}"
  end

  defp node_type_name(type) do
    type
    |> Atom.to_string()
    |> String.replace("_", " ")
  end
end
