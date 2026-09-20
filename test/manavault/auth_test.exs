defmodule Manavault.AuthTest do
  use ExUnit.Case, async: false

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

  test "admin password fingerprint is stable for a hash and changes when the hash rotates" do
    previous_hash = Application.get_env(:manavault, :admin_password_hash)
    first_hash = Auth.hash_password("first", iterations: 1)
    replacement_hash = Auth.hash_password("replacement", iterations: 1)

    on_exit(fn -> Application.put_env(:manavault, :admin_password_hash, previous_hash) end)

    Application.put_env(:manavault, :admin_password_hash, first_hash)
    fingerprint = Auth.admin_password_fingerprint()

    assert is_binary(fingerprint)
    assert Auth.admin_password_fingerprint() == fingerprint

    Application.put_env(:manavault, :admin_password_hash, replacement_hash)
    refute Auth.admin_password_fingerprint() == fingerprint
  end
end
