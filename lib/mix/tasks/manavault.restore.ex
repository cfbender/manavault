defmodule Mix.Tasks.Manavault.Restore do
  @moduledoc """
  Restores a ManaVault backup zip.

      mix manavault.restore /path/to/manavault-manual-20260617T120000Z.zip

  Stop the app before restoring. The restore writes the SQLite database and
  local user-owned files from the backup artifact.
  """

  use Mix.Task

  @shortdoc "Restores a ManaVault backup zip"

  @impl Mix.Task
  def run(args) do
    Mix.Task.run("app.config")

    {opts, argv, invalid} =
      OptionParser.parse(args,
        strict: [data_dir: :string, database: :string],
        aliases: []
      )

    if invalid != [] do
      Mix.raise("invalid restore options: #{inspect(invalid)}")
    end

    artifact_path =
      case argv do
        [path] -> path
        _ -> Mix.raise("usage: mix manavault.restore /path/to/backup.zip")
      end

    restore_opts =
      []
      |> put_if_present(:data_dir, opts[:data_dir])
      |> put_if_present(:database_path, opts[:database])

    database_path = Manavault.Backup.restore!(artifact_path, restore_opts)
    Mix.shell().info("Restored database: #{database_path}")
  end

  defp put_if_present(opts, _key, nil), do: opts
  defp put_if_present(opts, key, value), do: Keyword.put(opts, key, value)
end
