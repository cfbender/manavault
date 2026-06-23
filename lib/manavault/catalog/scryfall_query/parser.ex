defmodule Manavault.Catalog.ScryfallQuery.Parser do
  @moduledoc false

  alias Manavault.Catalog.ScryfallQuery.{And, ExactName, Not, Or, Predicate, Tokenizer}

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

  @operators [
    {"!=", :neq},
    {">=", :gte},
    {"<=", :lte},
    {":", :colon},
    {"=", :eq},
    {">", :gt},
    {"<", :lt}
  ]

  def parse(query) when is_binary(query) do
    with {:ok, tokens} <- Tokenizer.tokenize(query),
         {:ok, expr, []} <- parse_or(tokens) do
      {:ok, simplify(expr)}
    else
      {:ok, _expr, rest} -> {:error, "unexpected token #{inspect(List.first(rest))}"}
      {:error, reason} -> {:error, reason}
    end
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
end
