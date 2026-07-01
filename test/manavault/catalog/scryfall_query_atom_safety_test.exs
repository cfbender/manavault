defmodule Manavault.Catalog.ScryfallQueryAtomSafetyTest do
  use ExUnit.Case, async: false

  alias Manavault.Catalog.ScryfallQuery
  alias Manavault.Catalog.ScryfallQuery.Predicate

  # base-26 lowercase, no digits, so it survives the field regex in the parser
  defp alpha(n), do: "zzq" <> encode(n, "")
  defp encode(0, ""), do: "a"
  defp encode(0, acc), do: acc
  defp encode(n, acc), do: encode(div(n, 26), <<?a + rem(n, 26)>> <> acc)

  test "parsing many distinct unknown field names does not grow the atom table" do
    # warm up so unrelated first-call atoms don't skew the measurement
    {:ok, _} = ScryfallQuery.parse("#{alpha(0)}:value")

    before = :erlang.system_info(:atom_count)

    for i <- 1..500 do
      {:ok, _} = ScryfallQuery.parse("#{alpha(i)}:value")
    end

    growth = :erlang.system_info(:atom_count) - before

    # Without the fix this grows by ~500 (one atom per distinct field).
    assert growth < 50
  end

  test "unknown fields normalize to :unknown" do
    assert {:ok, %Predicate{field: :unknown}} = ScryfallQuery.parse("zzqtotallyunknown:value")
  end

  test "canonical field names absent from the alias table still resolve" do
    assert {:ok, %Predicate{field: :mana_value}} = ScryfallQuery.parse("mana_value:3")
    assert {:ok, %Predicate{field: :collector_number}} = ScryfallQuery.parse("collector_number:5")
  end
end
