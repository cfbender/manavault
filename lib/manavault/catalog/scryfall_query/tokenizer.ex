defmodule Manavault.Catalog.ScryfallQuery.Tokenizer do
  @moduledoc false

  def tokenize(input), do: input |> tokenize([], "", :normal) |> finalize_tokens()

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
end
