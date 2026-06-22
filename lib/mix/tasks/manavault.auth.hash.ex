defmodule Mix.Tasks.Manavault.Auth.Hash do
  @moduledoc """
  Generates a ManaVault admin password hash.

      mix manavault.auth.hash "correct horse battery staple"

  Store the printed value in `MANAVAULT_ADMIN_PASSWORD_HASH`.
  """

  use Mix.Task

  @shortdoc "Generates MANAVAULT_ADMIN_PASSWORD_HASH"

  @impl Mix.Task
  def run([password]) when is_binary(password) and password != "" do
    Mix.shell().info(Manavault.Auth.hash_password(password))
  end

  def run(_args) do
    Mix.raise("Usage: mix manavault.auth.hash PASSWORD")
  end
end
