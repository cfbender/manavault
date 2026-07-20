defmodule Manavault.Catalog.Search.NameMatchTest do
  use ExUnit.Case, async: true

  alias Manavault.Catalog.Search.NameMatch

  defp entry(name) do
    normalized = NameMatch.normalize(name)

    %{
      name: name,
      normalized_name: normalized,
      compact_name: String.replace(normalized, " ", ""),
      tokens: String.split(normalized, " ", trim: true)
    }
  end

  describe "normalize/1" do
    test "lowercases, drops apostrophes, and collapses non-alphanumerics" do
      assert NameMatch.normalize("Aurelia's Fury") == "aurelias fury"
      assert NameMatch.normalize("Aurelia’s Fury") == "aurelias fury"
      assert NameMatch.normalize("  Mask,  of-Memory! ") == "mask of memory"
    end
  end

  describe "like_pattern/1" do
    test "downcases, strips apostrophes, escapes LIKE metacharacters, and wraps" do
      assert NameMatch.like_pattern("Urza's") == "%urzas%"
      assert NameMatch.like_pattern("100% _\\") == "%100\\% \\_\\\\%"
    end
  end

  describe "candidate?/2" do
    test "exact, prefix, and substring terms match" do
      mask = entry("Mask of Memory")

      assert NameMatch.candidate?("mask of memory", mask)
      assert NameMatch.candidate?("mask of mem", mask)
      assert NameMatch.candidate?("of memory", mask)
    end

    test "every significant term token must match a name token" do
      refute NameMatch.candidate?("mask of memory", entry("Agent of Masks"))
      refute NameMatch.candidate?("mask of memory", entry("Aegis of the Meek"))
      assert NameMatch.candidate?("mask memory", entry("Mask of Memory"))
    end

    test "a stopword-only overlap never admits a candidate" do
      refute NameMatch.candidate?("memory of mask", entry("Aetherize"))
      refute NameMatch.candidate?("of", entry("Lightning Bolt"))
      assert NameMatch.candidate?("of", entry("Aegis of the Meek"))
    end

    test "per-token typos within the distance threshold match" do
      assert NameMatch.candidate?("mask of memroy", entry("Mask of Memory"))
      assert NameMatch.candidate?("serra angle", entry("Serra Angel"))
      refute NameMatch.candidate?("mask of xyzzy", entry("Mask of Memory"))
    end

    test "fuzzy token matches require a shared initial" do
      refute NameMatch.candidate?("bolt", entry("Colt"))
    end

    test "compacted term within distance of the compacted name matches" do
      assert NameMatch.candidate?("lightningbilt", entry("Lightning Bolt"))
    end

    test "blank terms never match" do
      refute NameMatch.candidate?("", entry("Mask of Memory"))
    end
  end

  describe "score/2" do
    test "orders exact before prefix before substring before fuzzy" do
      exact = NameMatch.score("mask of memory", entry("Mask of Memory"))
      prefix = NameMatch.score("mask", entry("Mask of Avacyn"))
      substring = NameMatch.score("memory", entry("Mask of Memory"))
      fuzzy = NameMatch.score("memroy", entry("Mask of Memory"))

      assert exact < prefix
      assert prefix < substring
      assert substring < fuzzy
    end

    test "shorter names rank first within the prefix class" do
      assert NameMatch.score("mask", entry("Mask")) <
               NameMatch.score("mask", entry("Mask of Avacyn"))
    end
  end
end
