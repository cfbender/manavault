defmodule ManavaultWeb.Plugs.PublicGraphQLProtection do
  @moduledoc false

  import Plug.Conn

  alias Manavault.PublicShareRequestLimiter
  alias ManavaultWeb.ClientIP

  @max_depth 12

  def init(mode) when mode in [:admit, :validate], do: mode

  def call(conn, :admit) do
    if public_graphql_path?(conn.request_path) do
      admit(conn)
    else
      conn
    end
  end

  def call(conn, :validate) do
    conn = fetch_query_params(conn)

    if Map.has_key?(conn.params, "_json") or Map.has_key?(conn.params, "operations") do
      reject(conn, 400, "GraphQL request batches are not supported")
    else
      conn
    end
  end

  defp admit(conn) do
    case PublicShareRequestLimiter.check(ClientIP.identifier(conn)) do
      :ok ->
        conn

      {:rate_limited, retry_after} ->
        conn
        |> put_resp_header("retry-after", Integer.to_string(retry_after))
        |> reject(429, "Too many public GraphQL requests")
    end
  end

  defp public_graphql_path?("/share/graphql"), do: true
  defp public_graphql_path?("/share/graphql/" <> _rest), do: true
  defp public_graphql_path?(_path), do: false

  def pipeline(config, opts) do
    config
    |> Absinthe.Plug.default_pipeline(opts)
    |> Absinthe.Pipeline.insert_before(
      Absinthe.Phase.Document.Arguments.Data,
      {__MODULE__.MaxDepth, max_depth: @max_depth}
    )
  end

  defp reject(conn, status, message) do
    body = Jason.encode!(%{errors: [%{message: message}]})

    conn
    |> put_resp_content_type("application/json")
    |> send_resp(status, body)
    |> halt()
  end

  defmodule MaxDepth do
    @moduledoc false

    use Absinthe.Phase

    alias Absinthe.{Blueprint, Phase}
    alias Absinthe.Blueprint.Document.Field
    alias Absinthe.Blueprint.Document.Fragment.{Inline, Named, Spread}
    alias Absinthe.Blueprint.Document.Operation

    @impl Absinthe.Phase
    def run(%Blueprint{} = blueprint, opts) do
      max_depth = Keyword.fetch!(opts, :max_depth)

      case Blueprint.current_operation(blueprint) do
        %Operation{} = operation -> check_depth(blueprint, operation, max_depth)
        nil -> {:ok, blueprint}
      end
    end

    defp check_depth(blueprint, operation, max_depth) do
      fragments =
        Map.new(blueprint.fragments, fn %Named{name: name} = fragment -> {name, fragment} end)

      depth = selections_depth(operation.selections, fragments, 0, MapSet.new())

      if depth <= max_depth do
        {:ok, blueprint}
      else
        error = %Phase.Error{
          phase: __MODULE__,
          message: "GraphQL operation exceeds maximum depth #{max_depth}",
          locations: List.wrap(operation.source_location),
          extra: %{code: "MAX_DEPTH_EXCEEDED", max_depth: max_depth}
        }

        blueprint = update_in(blueprint.execution.validation_errors, &[error | &1])
        {:jump, blueprint, Absinthe.Phase.Document.Result}
      end
    end

    defp selections_depth(selections, fragments, parent_depth, visiting) do
      Enum.reduce(selections, parent_depth, fn selection, deepest ->
        max(deepest, selection_depth(selection, fragments, parent_depth, visiting))
      end)
    end

    defp selection_depth(%Field{selections: selections}, fragments, parent_depth, visiting) do
      depth = parent_depth + 1
      selections_depth(selections, fragments, depth, visiting)
    end

    defp selection_depth(%Inline{selections: selections}, fragments, parent_depth, visiting) do
      selections_depth(selections, fragments, parent_depth, visiting)
    end

    defp selection_depth(%Spread{name: name}, fragments, parent_depth, visiting) do
      cond do
        MapSet.member?(visiting, name) ->
          parent_depth

        match?(%Named{}, fragments[name]) ->
          %Named{selections: selections} = fragments[name]
          selections_depth(selections, fragments, parent_depth, MapSet.put(visiting, name))

        true ->
          parent_depth
      end
    end
  end
end
