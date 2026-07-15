defmodule ManavaultWeb.DeckSharePreview.ArtifactStore do
  @moduledoc false

  @temporary_marker ".tmp-"

  def prepare(cache_dir) when is_binary(cache_dir) do
    with :ok <- File.mkdir_p(cache_dir),
         :ok <- remove_stale_temporary_files(cache_dir) do
      :ok
    end
  end

  def read(cache_dir, fingerprint) when is_binary(cache_dir) and is_binary(fingerprint) do
    File.read(path(cache_dir, fingerprint))
  end

  def write(cache_dir, fingerprint, png)
      when is_binary(cache_dir) and is_binary(fingerprint) and is_binary(png) do
    artifact_path = path(cache_dir, fingerprint)
    temporary_path = temporary_path(artifact_path)

    try do
      with :ok <- File.mkdir_p(cache_dir),
           :ok <- File.write(temporary_path, png, [:binary, :exclusive]),
           :ok <- File.rename(temporary_path, artifact_path) do
        :ok
      end
    after
      File.rm(temporary_path)
    end
  end

  def path(cache_dir, fingerprint) when is_binary(cache_dir) and is_binary(fingerprint) do
    Path.join(cache_dir, "#{fingerprint}.png")
  end

  defp temporary_path(artifact_path) do
    "#{artifact_path}#{@temporary_marker}#{:erlang.phash2(node())}-#{System.unique_integer([:positive, :monotonic])}"
  end

  defp remove_stale_temporary_files(cache_dir) do
    with {:ok, entries} <- File.ls(cache_dir) do
      entries
      |> Enum.filter(&String.contains?(&1, @temporary_marker))
      |> Enum.reduce_while(:ok, fn entry, :ok ->
        case remove_stale_temporary_file(Path.join(cache_dir, entry)) do
          :ok -> {:cont, :ok}
          {:error, reason} -> {:halt, {:error, reason}}
        end
      end)
    end
  end

  defp remove_stale_temporary_file(path) do
    case File.lstat(path) do
      {:ok, %File.Stat{type: :directory}} -> :ok
      {:ok, _stat} -> File.rm(path)
      {:error, :enoent} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end
end
