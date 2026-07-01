defmodule Manavault.Catalog.EDHRec.Response.CardLookupAtomSafetyTest do
  use ExUnit.Case, async: false

  alias Manavault.Catalog.EDHRec.Response.CardLookup

  test "reads string-keyed maps" do
    assert CardLookup.entry_string(%{"name" => "Sol Ring"}, "name") == "Sol Ring"
    assert CardLookup.entry_string(%{}, "name") == nil
    assert CardLookup.entry_number(%{"score" => 7}, "score") == 7
    assert CardLookup.entry_number(%{"score" => 1.5}, "score") == 1.5
    assert CardLookup.entry_number(%{}, "score") == nil
  end

  test "still reads atom-keyed maps when the atom already exists" do
    assert CardLookup.entry_string(%{name: "Sol Ring"}, "name") == "Sol Ring"
  end

  test "unknown keys never mint atoms" do
    before = :erlang.system_info(:atom_count)

    for i <- 1..300 do
      key = "zzqedhrecmissingkey" <> Integer.to_string(i)
      assert CardLookup.entry_string(%{}, key) == nil
      assert CardLookup.entry_number(%{}, key) == nil
    end

    growth = :erlang.system_info(:atom_count) - before
    assert growth < 50
  end
end
