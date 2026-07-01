require NimbleCSV

NimbleCSV.define(Manavault.Catalog.CollectionImport.CSVParser, separator: ",", escape: "\"")

defmodule Manavault.Catalog.CollectionImport do
  @moduledoc false

  alias Manavault.Catalog.CollectionImport.CSVParser
  alias Manavault.Catalog.{Price, Util}

  @type parsed_row :: {map(), pos_integer()}

  @spec parse(String.t(), keyword()) :: {:ok, [parsed_row()]} | {:error, atom()}
  def parse(text, opts \\ []) when is_binary(text) and is_list(opts) do
    format = opts |> Keyword.get(:format, :auto) |> normalize_format()
    file_name = Keyword.get(opts, :file_name) || Keyword.get(opts, :filename)

    text
    |> resolve_format(format, file_name)
    |> parse_as(text)
  rescue
    _error -> {:error, :invalid_import_file}
  end

  def attrs(row) when is_map(row) do
    %{
      "name" => Util.normalize_filter(Map.get(row, "name", "")),
      "set_code" => Util.normalize_filter(Map.get(row, "set_code", "")),
      "collector_number" => Util.normalize_filter(Map.get(row, "collector_number", "")),
      "quantity" => Util.parse_quantity(Map.get(row, "quantity", "1")),
      "finish" => normalize_finish(Map.get(row, "finish", "")),
      "condition" => normalize_condition(Map.get(row, "condition", "")),
      "language" => normalize_language(Map.get(row, "language", "")),
      "scryfall_id" => Util.normalize_filter(Map.get(row, "scryfall_id", "")),
      "purchase_price_cents" => Price.parse_cents(Map.get(row, "purchase_price_cents"))
    }
  end

  defp parse_as(:csv, text), do: parse_csv_entries(text)
  defp parse_as(:txt, text), do: {:ok, parse_text_entries(text)}
  defp parse_as(:unknown, _text), do: {:error, :invalid_import_format}

  defp parse_csv_entries(text) do
    case parse_csv(text) do
      [] ->
        {:ok, []}

      [headers | rows] ->
        headers = Enum.map(headers, &normalize_csv_header/1)

        entries =
          rows
          |> Enum.with_index(2)
          |> Enum.reject(fn {cells, _row_number} ->
            Enum.all?(cells, &(String.trim(&1 || "") == ""))
          end)
          |> Enum.map(fn {cells, row_number} ->
            row =
              headers
              |> Enum.zip(cells ++ List.duplicate("", max(length(headers) - length(cells), 0)))
              |> Map.new()

            {row, row_number}
          end)

        {:ok, entries}
    end
  end

  defp parse_text_entries(text) do
    text
    |> String.replace("\r\n", "\n")
    |> String.replace("\r", "\n")
    |> String.split("\n")
    |> Enum.with_index(1)
    |> Enum.reject(fn {line, _row_number} -> String.trim(line) == "" end)
    |> Enum.map(fn {line, row_number} -> {parse_text_line(line), row_number} end)
  end

  defp parse_text_line(line) do
    line
    |> String.trim()
    |> split_quantity()
    |> then(fn {quantity, rest} ->
      {rest, finish} = extract_text_finish(rest)
      printing = parse_text_printing(rest)

      printing
      |> Map.put("quantity", quantity)
      |> Map.put("finish", finish || "nonfoil")
    end)
  end

  defp split_quantity(line) do
    case Regex.run(~r/\A(\d+)(?:\s*x)?\s+(.+)\z/iu, line, capture: :all_but_first) do
      [quantity, rest] -> {quantity, String.trim(rest)}
      _other -> {"1", line}
    end
  end

  defp extract_text_finish(line) do
    cond do
      Regex.match?(~r/\s+\*F\*\s*\z/i, line) ->
        {Regex.replace(~r/\s+\*F\*\s*\z/i, line, "") |> String.trim(), "foil"}

      Regex.match?(~r/\s+\*E\*\s*\z/i, line) ->
        {Regex.replace(~r/\s+\*E\*\s*\z/i, line, "") |> String.trim(), "etched"}

      Regex.match?(~r/\s+\[(?:foil|foiled)\]\s*\z/i, line) ->
        {Regex.replace(~r/\s+\[(?:foil|foiled)\]\s*\z/i, line, "") |> String.trim(), "foil"}

      Regex.match?(~r/\s+\[(?:etched|foil etched|foil_etched)\]\s*\z/i, line) ->
        {Regex.replace(~r/\s+\[(?:etched|foil etched|foil_etched)\]\s*\z/i, line, "")
         |> String.trim(), "etched"}

      true ->
        {line, nil}
    end
  end

  defp parse_text_printing(line) do
    case Regex.named_captures(
           ~r/\A(?<name>.+?)\s+\((?<set_code>[A-Za-z0-9]+)\)\s+(?<collector_number>\S+)\z/u,
           line
         ) do
      %{"name" => name, "set_code" => set_code, "collector_number" => collector_number} ->
        %{
          "name" => String.trim(name),
          "set_code" => set_code,
          "collector_number" => collector_number
        }

      _no_printing ->
        %{"name" => line, "set_code" => "", "collector_number" => ""}
    end
  end

  defp parse_csv(text) do
    text
    |> String.replace("\r\n", "\n")
    |> String.replace("\r", "\n")
    |> CSVParser.parse_string(skip_headers: false)
    |> Enum.map(fn cells -> Enum.map(cells, &String.trim/1) end)
    |> Enum.reject(fn row -> Enum.all?(row, &(&1 == "")) end)
  end

  defp resolve_format(_text, format, _file_name) when format in [:csv, :txt, :unknown], do: format

  defp resolve_format(text, :auto, file_name) do
    cond do
      file_format(file_name) in [:csv, :txt] -> file_format(file_name)
      csv_like?(text) -> :csv
      true -> :txt
    end
  end

  defp file_format(file_name) when is_binary(file_name) do
    case file_name |> Path.extname() |> String.downcase() do
      ".csv" -> :csv
      ".txt" -> :txt
      _other -> nil
    end
  end

  defp file_format(_file_name), do: nil

  defp csv_like?(text) do
    text
    |> String.replace("\r\n", "\n")
    |> String.replace("\r", "\n")
    |> String.split("\n", trim: true)
    |> List.first("")
    |> then(fn line -> String.contains?(line, ",") and line_has_known_csv_header?(line) end)
  end

  defp line_has_known_csv_header?(line) do
    line
    |> parse_csv()
    |> case do
      [headers | _rows] -> Enum.any?(headers, &(normalize_csv_header(&1) in ["name", "quantity"]))
      [] -> false
    end
  end

  defp normalize_format(nil), do: :auto
  defp normalize_format(:auto), do: :auto
  defp normalize_format(:csv), do: :csv
  defp normalize_format(:txt), do: :txt
  defp normalize_format(:text), do: :txt

  defp normalize_format(format) when is_binary(format) do
    case format |> String.trim() |> String.downcase() do
      "" -> :auto
      "auto" -> :auto
      "csv" -> :csv
      "text" -> :txt
      "txt" -> :txt
      "plain" -> :txt
      "text/plain" -> :txt
      "text/csv" -> :csv
      "text/comma-separated-values" -> :csv
      "application/csv" -> :csv
      "application/vnd.ms-excel" -> :csv
      _other -> :unknown
    end
  end

  defp normalize_format(_format), do: :unknown

  defp normalize_csv_header(header) do
    header
    |> Util.normalize_filter()
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9]+/, "_")
    |> String.trim("_")
    |> case do
      key when key in ["card", "card_name", "name"] ->
        "name"

      key when key in ["set", "set_code", "edition"] ->
        "set_code"

      key when key in ["collector", "collector_number", "number", "cn"] ->
        "collector_number"

      key when key in ["qty", "count", "quantity"] ->
        "quantity"

      key when key in ["foil", "foiling", "finish"] ->
        "finish"

      key when key in ["condition", "cond"] ->
        "condition"

      key when key in ["language", "lang"] ->
        "language"

      key when key in ["purchase_price", "purchase_price_usd", "price_paid", "paid"] ->
        "purchase_price_cents"

      key when key in ["scryfall", "scryfall_id", "printing_id"] ->
        "scryfall_id"

      key ->
        key
    end
  end

  defp normalize_finish(value) do
    value
    |> Util.normalize_filter()
    |> String.replace(" ", "_")
    |> case do
      value when value in ["foil", "true", "yes", "y"] -> "foil"
      value when value in ["etched", "foil_etched"] -> "etched"
      "non_foil" -> "nonfoil"
      "nonfoil" -> "nonfoil"
      _other -> "nonfoil"
    end
  end

  defp normalize_condition(value) do
    value
    |> Util.normalize_filter()
    |> String.replace(~r/[^a-z0-9]+/, "_")
    |> String.trim("_")
    |> case do
      value when value in ["nm", "near_mint", "nearmint"] -> "near_mint"
      value when value in ["lp", "lightly_played", "light_played"] -> "lightly_played"
      value when value in ["mp", "moderately_played", "mod_played"] -> "moderately_played"
      value when value in ["hp", "heavily_played", "heavy_played"] -> "heavily_played"
      value when value in ["d", "dm", "damaged"] -> "damaged"
      _other -> "near_mint"
    end
  end

  defp normalize_language(value) do
    case Util.normalize_filter(value) do
      "" -> "en"
      language -> language
    end
  end
end
