defmodule Manavault.Catalog.Scryfall.BulkDataTest do
  use ExUnit.Case, async: true

  alias Manavault.Catalog.Scryfall.BulkData

  test "decoded records can halt before consuming the full gzip stream" do
    records =
      Enum.map(1..3_000, fn index ->
        %{
          "name" => "Card #{index}",
          "digest" => :sha256 |> :crypto.hash(Integer.to_string(index)) |> Base.encode16()
        }
      end)

    payload = gzip_jsonl(records)
    assert byte_size(payload) > 64 * 1024
    assert {:ok, decoded, 3_000} = BulkData.decode(payload)
    assert %{"name" => "Card 1"} = Enum.find(decoded, &(&1["name"] == "Card 1"))
  end

  test "truncated gzip payloads are rejected" do
    payload = gzip_jsonl([%{"name" => "Incomplete"}])
    truncated = binary_part(payload, 0, byte_size(payload) - 8)

    assert {:error, error} = BulkData.decode(truncated)
    assert error =~ ~r/decompress|truncated/i
  end

  defp gzip_jsonl(records) do
    records
    |> Enum.map_join("\n", &Jason.encode!/1)
    |> Kernel.<>("\n")
    |> :zlib.gzip()
  end
end
