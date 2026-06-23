defmodule Manavault.Catalog.ScryfallQuery do
  @moduledoc """
  Parser and canonical serializer for the Scryfall search syntax subset used by
  collection-card filtering.

  The AST intentionally preserves unsupported keyed predicates. Query backends can
  then decide whether to reject, ignore, or fail closed for fields the local data
  model does not store yet.
  """

  alias Manavault.Catalog.ScryfallQuery.{Parser, Serializer}

  defmodule And do
    @moduledoc false
    defstruct terms: []
  end

  defmodule Or do
    @moduledoc false
    defstruct terms: []
  end

  defmodule Not do
    @moduledoc false
    defstruct expr: nil
  end

  defmodule Predicate do
    @moduledoc false
    defstruct field: :text, op: :colon, value: "", regex?: false
  end

  defmodule ExactName do
    @moduledoc false
    defstruct name: ""
  end

  @type op :: :colon | :eq | :neq | :gt | :gte | :lt | :lte
  @type expr ::
          %And{terms: [expr()]}
          | %Or{terms: [expr()]}
          | %Not{expr: expr()}
          | %Predicate{field: atom(), op: op(), value: String.t(), regex?: boolean()}
          | %ExactName{name: String.t()}

  @doc """
  Parses a Scryfall query string into an AST.
  """
  @spec parse(String.t()) :: {:ok, expr()} | {:error, String.t()}
  def parse(query) when is_binary(query), do: Parser.parse(query)

  @doc """
  Parses a query and raises on invalid syntax.
  """
  @spec parse!(String.t()) :: expr()
  def parse!(query) do
    case parse(query) do
      {:ok, expr} -> expr
      {:error, reason} -> raise ArgumentError, reason
    end
  end

  @doc """
  Serializes an AST into a canonical Scryfall-style query string.
  """
  @spec to_query(expr()) :: String.t()
  def to_query(expr), do: Serializer.to_query(expr)
end
