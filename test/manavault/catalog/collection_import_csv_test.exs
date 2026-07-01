defmodule Manavault.Catalog.CollectionImportCsvTest do
  use ExUnit.Case, async: true

  alias Manavault.Catalog.CollectionImport

  test "parses quoted fields with commas, escaped quotes, trimming, and skips blank rows" do
    csv =
      """
      Quantity,Card Name,Set Code,Collector Number
      2,"Fire, Ice", apc , 128

      1,"He said ""hi\""",xyz,7
      """

    assert {:ok, entries} = CollectionImport.parse(csv, format: :csv)

    rows = Enum.map(entries, fn {row, _row_number} -> row end)

    assert length(rows) == 2

    assert [first, second] = rows

    # Quoted comma stays one field; surrounding whitespace is trimmed.
    assert first["quantity"] == "2"
    assert first["name"] == "Fire, Ice"
    assert first["set_code"] == "apc"
    assert first["collector_number"] == "128"

    # Escaped double-quote is unescaped.
    assert second["quantity"] == "1"
    assert second["name"] == ~s(He said "hi")
    assert second["set_code"] == "xyz"
    assert second["collector_number"] == "7"
  end

  test "handles CRLF and lone-CR line endings" do
    csv = "Quantity,Card Name\r\n1,Alpha\r2,Beta\r\n"

    assert {:ok, entries} = CollectionImport.parse(csv, format: :csv)
    names = Enum.map(entries, fn {row, _} -> row["name"] end)

    assert names == ["Alpha", "Beta"]
  end
end
