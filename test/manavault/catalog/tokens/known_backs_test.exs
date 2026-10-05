defmodule Manavault.Catalog.Tokens.KnownBacksTest do
  use ExUnit.Case, async: true

  alias Manavault.Catalog.Tokens.KnownBacks

  @face ~r/^[a-z0-9]{3,6}\/[0-9]+[a-z★]?$/

  test "data file holds well-formed, distinct, non-reflexive pairs" do
    pairs = KnownBacks.pairs()
    refute Enum.empty?(pairs)

    for %{"front" => front, "back" => back} <- pairs do
      assert front =~ @face, "bad face key #{inspect(front)}"
      assert back =~ @face, "bad face key #{inspect(back)}"
      refute front == back, "token paired with itself: #{front}"
    end

    keys = Enum.map(pairs, &Enum.sort([&1["front"], &1["back"]]))
    assert keys == Enum.uniq(keys), "duplicate pairs in token_backs.json"
  end

  test "back_keys reads a pairing from either side" do
    # Modern Horizons 3 Commander's Dragon (M3C #12) ships with Shapeshifter,
    # Copy, or Treasure on its back depending on the deck.
    assert [{"tm3c", "8"}, {"tmh3", "1"}, {"tmh3", "34"}] = KnownBacks.back_keys("tm3c", "12")
    assert {"tm3c", "12"} in KnownBacks.back_keys("tmh3", "1")
    assert {"tm3c", "12"} in KnownBacks.back_keys("tmh3", "34")
  end

  test "back_keys is empty for faces without pairing data" do
    assert [] = KnownBacks.back_keys("tlea", "1")
    assert [] = KnownBacks.back_keys("tm3c", "9999")
  end
end
