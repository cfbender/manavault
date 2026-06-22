defmodule Manavault.AuthTest do
  use ExUnit.Case, async: true

  alias Manavault.Auth

  test "hash_password produces a verifiable hash" do
    hash = Auth.hash_password("correct horse", iterations: 1)

    assert Auth.verify_password("correct horse", hash)
    refute Auth.verify_password("wrong", hash)
  end

  test "verify_password rejects malformed hashes" do
    refute Auth.verify_password("password", "")
    refute Auth.verify_password("password", "pbkdf2_sha256$nope$salt$hash")
    refute Auth.verify_password("password", "sha256$1$salt$hash")
  end
end
