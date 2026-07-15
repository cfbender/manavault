defmodule ManavaultWeb.DeckSharePreview.ArtifactStore do
  @moduledoc false

  @default_max_artifacts 500
  @temporary_marker ".tmp-"

  def prepare(cache_dir), do: prepare(cache_dir, @default_max_artifacts)

  def prepare(cache_dir, max_artifacts)
      when is_binary(cache_dir) and is_integer(max_artifacts) and max_artifacts > 0 do
    with :ok <- File.mkdir_p(cache_dir),
         :ok <- remove_stale_temporary_files(cache_dir),
         :ok <- prune_completed_artifacts(cache_dir, max_artifacts, nil) do
      :ok
    end
  end

  def read(cache_dir, fingerprint) when is_binary(cache_dir) and is_binary(fingerprint) do
    File.read(path(cache_dir, fingerprint))
  end

  def write(cache_dir, fingerprint, png), do: write(cache_dir, fingerprint, png, @default_max_artifacts)

  def write(cache_dir, fingerprint, png, max_artifacts)
      when is_binary(cache_dir) and is_binary(fingerprint) and is_binary(png) and
             is_integer(max_artifacts) and max_artifacts > 0 do
    artifact_path = path(cache_dir, fingerprint)
    temporary_path = temporary_path(artifact_path)

    try do
      with :ok <- File.mkdir_p(cache_dir),
           :ok <- File.write(temporary_path, png, [:binary, :exclusive]),
           :ok <- File.rename(temporary_path, artifact_path) do
        case prune_completed_artifacts(cache_dir, max_artifacts, artifact_path) do
          :ok ->
            :ok

          {:error, reason} ->
            File.rm(artifact_path)
            {:error, reason}
        end
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

  defp prune_completed_artifacts(cache_dir, max_artifacts, preserve_path) do
    with {:ok, entries} <- File.ls(cache_dir),
         {:ok, artifacts} <- completed_artifacts(cache_dir, entries),
         :ok <- remove_excess_artifacts(artifacts, max_artifacts, preserve_path) do
      :ok
    end
  end

  defp completed_artifacts(cache_dir, entries) do
    entries
    |> Enum.filter(&completed_artifact_filename?/1)
    |> Enum.reduce_while({:ok, []}, fn entry, {:ok, artifacts} ->
      path = Path.join(cache_dir, entry)

      case File.lstat(path) do
        {:ok, %File.Stat{type: :regular, mtime: mtime}} ->
          {:cont, {:ok, [%{mtime: mtime, path: path} | artifacts]}}

        {:ok, _stat} ->
          {:cont, {:ok, artifacts}}

        {:error, :enoent} ->
          {:cont, {:ok, artifacts}}

        {:error, reason} ->
          {:halt, {:error, reason}}
      end
    end)
  end

  defp remove_excess_artifacts(artifacts, max_artifacts, preserve_path) do
    excess = max(length(artifacts) - max_artifacts, 0)

    artifacts
    |> Enum.reject(&(&1.path == preserve_path))
    |> Enum.sort_by(&{&1.mtime, &1.path})
    |> Enum.take(excess)
    |> Enum.reduce_while(:ok, fn %{path: path}, :ok ->
      case File.rm(path) do
        :ok -> {:cont, :ok}
        {:error, :enoent} -> {:cont, :ok}
        {:error, reason} -> {:halt, {:error, reason}}
      end
    end)
  end

  defp completed_artifact_filename?(<<fingerprint::binary-size(64), ".png">>) do
    String.match?(fingerprint, ~r/\A[0-9a-f]{64}\z/)
  end

  defp completed_artifact_filename?(_entry), do: false
end
