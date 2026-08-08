defmodule Manavault.Catalog.UtilTest do
  use ExUnit.Case, async: true

  alias Manavault.Catalog.Util

  test "positive_quantity/1 keeps positive integers and clamps everything else to 1" do
    assert Util.positive_quantity(3) == 3
    assert Util.positive_quantity(1) == 1
    assert Util.positive_quantity(0) == 1
    assert Util.positive_quantity(-2) == 1
    assert Util.positive_quantity("4") == 1
    assert Util.positive_quantity(nil) == 1
  end
end
