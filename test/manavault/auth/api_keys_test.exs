defmodule Manavault.Auth.ApiKeysTest do
  use Manavault.DataCase

  alias Manavault.Auth.{ApiKey, ApiKeys}
  alias Manavault.Repo

  test "creates a named key while storing only its hash" do
    assert {:ok, api_key, token} = ApiKeys.create("The Gathering")
    assert String.starts_with?(token, "mvk_")
    assert byte_size(token) == 47

    stored = Repo.get!(ApiKey, api_key.id)
    assert stored.name == "The Gathering"
    assert stored.prefix == String.slice(token, 0, 12)
    assert stored.token_hash == ApiKeys.hash(token)
    refute stored.token_hash == token
    assert {:ok, authenticated} = ApiKeys.authenticate(token)
    assert authenticated.id == api_key.id
    assert authenticated.last_used_at
  end

  test "rejects unknown keys and revoked keys immediately" do
    assert :error = ApiKeys.authenticate("mvk_" <> String.duplicate("x", 43))
    assert {:ok, api_key, token} = ApiKeys.create("Temporary")
    assert {:ok, _revoked} = ApiKeys.revoke(api_key.id)
    assert :error = ApiKeys.authenticate(token)
  end
end
