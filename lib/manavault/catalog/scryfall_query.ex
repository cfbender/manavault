defmodule Manavault.Catalog.ScryfallQuery do
  @moduledoc """
  Parser and canonical serializer for the Scryfall search syntax subset used by
  collection-card filtering.

  The AST intentionally preserves unsupported keyed predicates. Query backends can
  then decide whether to reject, ignore, or fail closed for fields the local data
  model does not store yet.
  """

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

  @field_aliases %{
    "n" => :name,
    "name" => :name,
    "t" => :type,
    "type" => :type,
    "o" => :oracle,
    "oracle" => :oracle,
    "fo" => :oracle,
    "fulloracle" => :oracle,
    "keyword" => :keyword,
    "kw" => :keyword,
    "m" => :mana,
    "mana" => :mana,
    "mv" => :mana_value,
    "cmc" => :mana_value,
    "manavalue" => :mana_value,
    "c" => :colors,
    "color" => :colors,
    "id" => :identity,
    "identity" => :identity,
    "r" => :rarity,
    "rarity" => :rarity,
    "s" => :set,
    "e" => :set,
    "set" => :set,
    "edition" => :set,
    "cn" => :collector_number,
    "number" => :collector_number,
    "lang" => :language,
    "language" => :language,
    "is" => :is,
    "usd" => :usd,
    "eur" => :eur,
    "tix" => :tix,
    "date" => :date,
    "year" => :year,
    "released" => :date,
    "artist" => :artist,
    "flavor" => :flavor,
    "ft" => :flavor,
    "game" => :game,
    "format" => :format,
    "legal" => :legal,
    "banned" => :banned,
    "restricted" => :restricted,
    "unique" => :unique,
    "order" => :order,
    "direction" => :direction
  }

  @canonical_fields %{
    text: nil,
    name: "name",
    type: "type",
    oracle: "oracle",
    keyword: "keyword",
    mana: "mana",
    mana_value: "mv",
    colors: "c",
    identity: "id",
    rarity: "rarity",
    set: "set",
    collector_number: "number",
    language: "lang",
    is: "is",
    usd: "usd",
    eur: "eur",
    tix: "tix",
    date: "date",
    year: "year",
    artist: "artist",
    flavor: "flavor",
    game: "game",
    format: "format",
    legal: "legal",
    banned: "banned",
    restricted: "restricted",
    unique: "unique",
    order: "order",
    direction: "direction"
  }

  @operators [
    {"!=", :neq},
    {">=", :gte},
    {"<=", :lte},
    {":", :colon},
    {"=", :eq},
    {">", :gt},
    {"<", :lt}
  ]

  @operator_strings Map.new(@operators, fn {string, atom} -> {atom, string} end)

  @doc """
  Parses a Scryfall query string into an AST.
  """
  @spec parse(String.t()) :: {:ok, expr()} | {:error, String.t()}
  def parse(query) when is_binary(query) do
    with {:ok, tokens} <- tokenize(query),
         {:ok, expr, []} <- parse_or(tokens) do
      {:ok, simplify(expr)}
    else
      {:ok, _expr, rest} -> {:error, "unexpected token #{inspect(List.first(rest))}"}
      {:error, reason} -> {:error, reason}
    end
  end

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
  def to_query(expr), do: serialize(expr, :root)

  defp tokenize(input), do: input |> tokenize([], "", :normal) |> finalize_tokens()

  defp tokenize(<<>>, tokens, buffer, :normal), do: {:ok, flush_buffer(tokens, buffer)}
  defp tokenize(<<>>, _tokens, _buffer, :quote), do: {:error, "unterminated quoted phrase"}
  defp tokenize(<<>>, _tokens, _buffer, :regex), do: {:error, "unterminated regex"}

  defp tokenize(<<?\\, char, rest::binary>>, tokens, buffer, mode)
       when mode in [:quote, :regex] do
    tokenize(rest, tokens, buffer <> <<?\\, char>>, mode)
  end

  defp tokenize(<<?", rest::binary>>, tokens, buffer, :normal) do
    tokenize(rest, tokens, buffer <> <<?">>, :quote)
  end

  defp tokenize(<<?", rest::binary>>, tokens, buffer, :quote) do
    tokenize(rest, tokens, buffer <> <<?">>, :normal)
  end

  defp tokenize(<<?/, rest::binary>>, tokens, buffer, :normal) do
    if regex_prefix?(buffer) do
      tokenize(rest, tokens, buffer <> <<?/>>, :regex)
    else
      tokenize(rest, tokens, buffer <> <<?/>>, :normal)
    end
  end

  defp tokenize(<<?/, rest::binary>>, tokens, buffer, :regex) do
    tokenize(rest, tokens, buffer <> <<?/>>, :normal)
  end

  defp tokenize(<<char, rest::binary>>, tokens, buffer, :normal)
       when char in [?\s, ?\n, ?\t, ?\r] do
    tokenize(rest, flush_buffer(tokens, buffer), "", :normal)
  end

  defp tokenize(<<?(, rest::binary>>, tokens, "", :normal) do
    tokenize(rest, [:lparen | tokens], "", :normal)
  end

  defp tokenize(<<?(, rest::binary>>, tokens, buffer, :normal) do
    tokenize(rest, [:lparen | flush_buffer(tokens, buffer)], "", :normal)
  end

  defp tokenize(<<?), rest::binary>>, tokens, "", :normal) do
    tokenize(rest, [:rparen | tokens], "", :normal)
  end

  defp tokenize(<<?), rest::binary>>, tokens, buffer, :normal) do
    tokenize(rest, [:rparen | flush_buffer(tokens, buffer)], "", :normal)
  end

  defp tokenize(<<?-, rest::binary>>, tokens, "", :normal) do
    case String.trim_leading(rest) do
      <<"(", _::binary>> -> tokenize(rest, [:dash | tokens], "", :normal)
      _other -> tokenize(rest, tokens, "-", :normal)
    end
  end

  defp tokenize(<<char, rest::binary>>, tokens, buffer, mode) do
    tokenize(rest, tokens, buffer <> <<char>>, mode)
  end

  defp finalize_tokens({:ok, tokens}), do: {:ok, Enum.reverse(tokens)}
  defp finalize_tokens({:error, reason}), do: {:error, reason}

  defp flush_buffer(tokens, ""), do: tokens

  defp flush_buffer(tokens, buffer) do
    token =
      if String.downcase(buffer) == "or" do
        :or
      else
        {:word, buffer}
      end

    [token | tokens]
  end

  defp regex_prefix?(buffer) do
    String.match?(buffer, ~r/^[A-Za-z][A-Za-z_]*[:=]$/)
  end

  defp parse_or(tokens) do
    with {:ok, left, rest} <- parse_and(tokens) do
      parse_or_rest(left, rest)
    end
  end

  defp parse_or_rest(left, [:or | rest]) do
    with {:ok, right, rest} <- parse_and(rest) do
      left
      |> merge_or(right)
      |> parse_or_rest(rest)
    end
  end

  defp parse_or_rest(left, rest), do: {:ok, left, rest}

  defp parse_and(tokens), do: parse_and(tokens, [])

  defp parse_and([], []), do: {:ok, %And{terms: []}, []}
  defp parse_and([], terms), do: {:ok, terms |> Enum.reverse() |> and_expr(), []}

  defp parse_and([token | _rest] = tokens, terms) when token in [:or, :rparen] do
    {:ok, terms |> Enum.reverse() |> and_expr(), tokens}
  end

  defp parse_and(tokens, terms) do
    with {:ok, expr, rest} <- parse_unary(tokens) do
      parse_and(rest, [expr | terms])
    end
  end

  defp parse_unary([:dash | rest]) do
    with {:ok, expr, rest} <- parse_unary(rest) do
      {:ok, %Not{expr: expr}, rest}
    end
  end

  defp parse_unary([{:word, "-" <> raw} | rest]) when raw != "" do
    with {:ok, expr} <- parse_word(raw) do
      {:ok, %Not{expr: expr}, rest}
    end
  end

  defp parse_unary([{:word, "not:" <> raw} | rest]) when raw != "" do
    {:ok, %Not{expr: %Predicate{field: :is, op: :colon, value: unquote_value(raw)}}, rest}
  end

  defp parse_unary([{:word, "NOT:" <> raw} | rest]) when raw != "" do
    {:ok, %Not{expr: %Predicate{field: :is, op: :colon, value: unquote_value(raw)}}, rest}
  end

  defp parse_unary(tokens), do: parse_primary(tokens)

  defp parse_primary([:lparen | rest]) do
    with {:ok, expr, [:rparen | rest]} <- parse_or(rest) do
      {:ok, expr, rest}
    else
      {:ok, _expr, _rest} -> {:error, "missing closing parenthesis"}
      {:error, reason} -> {:error, reason}
    end
  end

  defp parse_primary([:rparen | _rest]), do: {:error, "unexpected closing parenthesis"}

  defp parse_primary([{:word, raw} | rest]) do
    with {:ok, expr} <- parse_word(raw) do
      {:ok, expr, rest}
    end
  end

  defp parse_primary([]), do: {:error, "expected search term"}
  defp parse_primary([token | _rest]), do: {:error, "unexpected token #{inspect(token)}"}

  defp parse_word("!" <> raw) when raw != "" do
    {:ok, %ExactName{name: unquote_value(raw)}}
  end

  defp parse_word(raw) do
    case split_predicate(raw) do
      {:ok, field, op, value} ->
        {:ok,
         %Predicate{
           field: normalize_field(field),
           op: op,
           value: unquote_value(value),
           regex?: regex_value?(value)
         }}

      :error ->
        {:ok, %Predicate{field: :text, op: :colon, value: unquote_value(raw)}}
    end
  end

  defp split_predicate(raw) do
    Enum.find_value(@operators, :error, fn {operator, op} ->
      case String.split(raw, operator, parts: 2) do
        [field, value] when field != "" and value != "" ->
          if String.match?(field, ~r/^[A-Za-z][A-Za-z_]*$/) do
            {:ok, field, op, value}
          else
            false
          end

        _other ->
          false
      end
    end)
  end

  defp normalize_field(field) do
    normalized = field |> String.downcase() |> String.replace("-", "_")
    Map.get(@field_aliases, normalized, String.to_atom(normalized))
  end

  defp regex_value?(value), do: String.starts_with?(value, "/") and String.ends_with?(value, "/")

  defp unquote_value(value) do
    cond do
      regex_value?(value) ->
        value |> String.trim_leading("/") |> String.trim_trailing("/") |> unescape()

      String.starts_with?(value, "\"") and String.ends_with?(value, "\"") ->
        value
        |> String.trim_leading("\"")
        |> String.trim_trailing("\"")
        |> unescape()

      true ->
        value
    end
  end

  defp unescape(value) do
    value
    |> String.replace("\\\"", "\"")
    |> String.replace("\\\\", "\\")
  end

  defp merge_or(%Or{terms: left}, %Or{terms: right}), do: %Or{terms: left ++ right}
  defp merge_or(%Or{terms: left}, right), do: %Or{terms: left ++ [right]}
  defp merge_or(left, %Or{terms: right}), do: %Or{terms: [left | right]}
  defp merge_or(left, right), do: %Or{terms: [left, right]}

  defp and_expr([single]), do: single
  defp and_expr(terms), do: %And{terms: terms}

  defp simplify(%And{terms: terms}) do
    terms = Enum.map(terms, &simplify/1)

    case terms do
      [single] -> single
      _many -> %And{terms: terms}
    end
  end

  defp simplify(%Or{terms: terms}) do
    terms = Enum.map(terms, &simplify/1)

    case terms do
      [single] -> single
      _many -> %Or{terms: terms}
    end
  end

  defp simplify(%Not{expr: expr}), do: %Not{expr: simplify(expr)}
  defp simplify(expr), do: expr

  defp serialize(%And{terms: []}, _context), do: ""

  defp serialize(%And{terms: terms}, context) do
    rendered = terms |> Enum.map(&serialize(&1, :and)) |> Enum.join(" ")

    if context == :not do
      "(" <> rendered <> ")"
    else
      rendered
    end
  end

  defp serialize(%Or{terms: terms}, context) do
    rendered = terms |> Enum.map(&serialize(&1, :or)) |> Enum.join(" or ")

    if context in [:and, :not] do
      "(" <> rendered <> ")"
    else
      rendered
    end
  end

  defp serialize(%Not{expr: expr}, _context), do: "-" <> serialize(expr, :not)
  defp serialize(%ExactName{name: name}, _context), do: "!" <> quote_value(name)

  defp serialize(%Predicate{field: :text, value: value}, _context), do: quote_value(value)

  defp serialize(%Predicate{field: field, op: op, value: value, regex?: regex?}, _context) do
    field_name = Map.get(@canonical_fields, field, Atom.to_string(field))
    operator = Map.fetch!(@operator_strings, op)
    rendered_value = if regex?, do: "/" <> escape_regex(value) <> "/", else: quote_value(value)
    field_name <> operator <> rendered_value
  end

  defp quote_value(value) do
    if String.match?(value, ~r/[\s()"]/), do: ~s("#{escape_quoted(value)}"), else: value
  end

  defp escape_quoted(value) do
    value
    |> String.replace("\\", "\\\\")
    |> String.replace("\"", "\\\"")
  end

  defp escape_regex(value) do
    value
    |> String.replace("\\", "\\\\")
    |> String.replace("/", ~S(\/))
  end
end
