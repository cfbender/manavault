defmodule Manavault.Encrypted.Binary do
  @moduledoc """
  Ecto type that encrypts string values at rest with AES-256-GCM.

  The encryption key is derived from the endpoint `secret_key_base`, which lives
  in the environment and is never stored in the database. As a result the
  ciphertext persisted in the (TEXT) column — and therefore any database
  snapshot embedded in a backup archive — is useless to anyone who does not also
  hold `secret_key_base`.

  Values are stored as `"enc.v1." <> Base.encode64(iv <> tag <> ciphertext)`, so
  the underlying column stays `:string` and no schema migration is required.
  Legacy plaintext values (written before this type was introduced) are returned
  as-is on load and transparently re-encrypted the next time the row is written.
  Ciphertext that cannot be decrypted (e.g. restored under a different
  `secret_key_base`) loads as `nil` rather than crashing, so the operator can
  simply re-enter the affected secret.
  """

  use Ecto.Type

  @prefix "enc.v1."
  @aad "manavault.encrypted.binary"

  @impl true
  def type, do: :string

  @impl true
  def cast(nil), do: {:ok, nil}
  def cast(value) when is_binary(value), do: {:ok, value}
  def cast(_value), do: :error

  @impl true
  def dump(nil), do: {:ok, nil}
  def dump(value) when is_binary(value), do: {:ok, @prefix <> Base.encode64(encrypt(value))}
  def dump(_value), do: :error

  @impl true
  def load(nil), do: {:ok, nil}

  def load(@prefix <> encoded) do
    with {:ok, packed} <- Base.decode64(encoded),
         {:ok, plaintext} <- decrypt(packed) do
      {:ok, plaintext}
    else
      # Undecryptable ciphertext (wrong/rotated key): treat the secret as absent
      # instead of raising and breaking the whole settings load.
      _ -> {:ok, nil}
    end
  end

  # Legacy plaintext written before encryption was introduced.
  def load(value) when is_binary(value), do: {:ok, value}

  defp encrypt(plaintext) do
    iv = :crypto.strong_rand_bytes(12)

    {ciphertext, tag} =
      :crypto.crypto_one_time_aead(:aes_256_gcm, key(), iv, plaintext, @aad, true)

    iv <> tag <> ciphertext
  end

  defp decrypt(<<iv::binary-12, tag::binary-16, ciphertext::binary>>) do
    case :crypto.crypto_one_time_aead(:aes_256_gcm, key(), iv, ciphertext, @aad, tag, false) do
      plaintext when is_binary(plaintext) -> {:ok, plaintext}
      _error -> :error
    end
  end

  defp decrypt(_packed), do: :error

  defp key do
    :crypto.hash(:sha256, "manavault.encrypted.binary.v1:" <> secret_key_base())
  end

  defp secret_key_base do
    :manavault
    |> Application.fetch_env!(ManavaultWeb.Endpoint)
    |> Keyword.get(:secret_key_base) ||
      raise "secret_key_base is required to encrypt/decrypt stored credentials"
  end
end
