defmodule Manavault.Auth do
  @moduledoc """
  Password-hash based owner authentication for self-hosted ManaVault installs.

  The app has one owner password, configured by `MANAVAULT_ADMIN_PASSWORD_HASH`.
  Authentication is enabled by default and can be disabled explicitly with
  `MANAVAULT_AUTH_DISABLED=true`.
  Hashes use PBKDF2-HMAC-SHA256 and are encoded as:

      pbkdf2_sha256$iterations$salt_base64url$hash_base64url
  """

  @algorithm "pbkdf2_sha256"
  @default_iterations 210_000
  @hash_bytes 32
  @salt_bytes 16

  def enabled? do
    not truthy?(Application.get_env(:manavault, :auth_disabled))
  end

  def configured? do
    enabled?() and not is_nil(admin_password_hash())
  end

  def verify_admin_password(password) when is_binary(password) do
    case admin_password_hash() do
      nil -> false
      hash -> verify_password(password, hash)
    end
  end

  def verify_admin_password(_password), do: false

  def admin_password_hash do
    :manavault
    |> Application.get_env(:admin_password_hash)
    |> blank_to_nil()
  end

  def disabled? do
    not enabled?()
  end

  def hash_password(password, opts \\ []) when is_binary(password) do
    iterations = Keyword.get(opts, :iterations, @default_iterations)
    salt = Keyword.get_lazy(opts, :salt, fn -> :crypto.strong_rand_bytes(@salt_bytes) end)
    digest = pbkdf2(password, salt, iterations)

    Enum.join(
      [@algorithm, iterations, encode64(salt), encode64(digest)],
      "$"
    )
  end

  def verify_password(password, encoded) when is_binary(password) and is_binary(encoded) do
    with [@algorithm, iterations_text, salt_text, digest_text] <- String.split(encoded, "$"),
         {iterations, ""} when iterations > 0 <- Integer.parse(iterations_text),
         {:ok, salt} <- decode64(salt_text),
         {:ok, expected_digest} <- decode64(digest_text) do
      password
      |> pbkdf2(salt, iterations)
      |> secure_compare(expected_digest)
    else
      _ -> false
    end
  end

  def verify_password(_password, _encoded), do: false

  defp pbkdf2(password, salt, iterations) do
    :crypto.pbkdf2_hmac(:sha256, password, salt, iterations, @hash_bytes)
  end

  defp secure_compare(left, right) when byte_size(left) == byte_size(right) do
    Plug.Crypto.secure_compare(left, right)
  end

  defp secure_compare(_left, _right), do: false

  defp encode64(value), do: Base.url_encode64(value, padding: false)
  defp decode64(value), do: Base.url_decode64(value, padding: false)

  defp blank_to_nil(value) when is_binary(value) do
    case String.trim(value) do
      "" -> nil
      trimmed -> trimmed
    end
  end

  defp blank_to_nil(_value), do: nil

  defp truthy?(value) when is_boolean(value), do: value

  defp truthy?(value) when is_binary(value) do
    value
    |> String.trim()
    |> String.downcase()
    |> Kernel.in(["1", "true", "yes", "on"])
  end

  defp truthy?(_value), do: false
end
