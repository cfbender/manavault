defmodule Manavault.Backup.Archive do
  @moduledoc false

  def create!(stage_dir, artifact_path) do
    files =
      stage_dir
      |> Path.join("**/*")
      |> Path.wildcard()
      |> Enum.filter(&File.regular?/1)
      |> Enum.map(&Path.relative_to(&1, stage_dir))

    case :zip.create(to_charlist(artifact_path), Enum.map(files, &to_charlist/1),
           cwd: to_charlist(stage_dir)
         ) do
      {:ok, _} -> :ok
      {:error, reason} -> raise "failed to write backup #{artifact_path}: #{inspect(reason)}"
    end
  end

  def extract!(artifact_path, extract_dir) do
    verify_entries!(artifact_path, extract_dir)

    case :zip.extract(to_charlist(artifact_path), cwd: to_charlist(extract_dir)) do
      {:ok, _files} -> :ok
      {:error, reason} -> raise "failed to extract backup #{artifact_path}: #{inspect(reason)}"
    end
  end

  # Guards against zip-slip before any archive entry is extracted.
  defp verify_entries!(artifact_path, extract_dir) do
    entries =
      case :zip.list_dir(to_charlist(artifact_path)) do
        {:ok, list} -> list
        {:error, reason} -> raise "failed to read backup #{artifact_path}: #{inspect(reason)}"
      end

    root = Path.expand(extract_dir)

    for entry <- entries, name = entry_name(entry) do
      resolved = Path.expand(name, root)

      if resolved != root and not String.starts_with?(resolved, root <> "/") do
        raise "refusing to extract backup #{artifact_path}: entry #{inspect(name)} escapes #{extract_dir}"
      end
    end

    :ok
  end

  defp entry_name({:zip_file, name, _info, _comment, _offset, _comp_size}),
    do: List.to_string(name)

  defp entry_name(_entry), do: nil
end
