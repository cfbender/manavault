defmodule Manavault.Encrypted.BinaryTest do
  use ExUnit.Case, async: true

  alias Manavault.Encrypted.Binary

  test "dump produces prefixed ciphertext that does not contain the plaintext" do
    {:ok, dumped} = Binary.dump("super-secret-key")

    assert String.starts_with?(dumped, "enc.v1.")
    refute dumped =~ "super-secret-key"
  end

  test "dump/load round-trips a value" do
    {:ok, dumped} = Binary.dump("super-secret-key")
    assert {:ok, "super-secret-key"} = Binary.load(dumped)
  end

  test "each dump uses a fresh IV so ciphertext differs" do
    {:ok, a} = Binary.dump("same-value")
    {:ok, b} = Binary.dump("same-value")

    refute a == b
    assert {:ok, "same-value"} = Binary.load(a)
    assert {:ok, "same-value"} = Binary.load(b)
  end

  test "nil passes through" do
    assert {:ok, nil} = Binary.dump(nil)
    assert {:ok, nil} = Binary.load(nil)
  end

  test "legacy plaintext loads unchanged" do
    assert {:ok, "legacy-plaintext"} = Binary.load("legacy-plaintext")
  end

  test "undecryptable ciphertext loads as nil instead of raising" do
    tampered = "enc.v1." <> Base.encode64(:crypto.strong_rand_bytes(40))
    assert {:ok, nil} = Binary.load(tampered)
  end
end
