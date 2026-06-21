defmodule Manavault.Catalog.ImageHashDaemon do
  @moduledoc """
  Persistent PIL-backed perceptual image hashing process.

  The scanner hashes one query image per capture. Keeping Python warm avoids paying
  interpreter/Pillow startup on every frame while preserving the same dHash logic
  used by `priv/image_hash.py`.
  """

  use GenServer

  require Logger

  @read_timeout 15_000

  def start_link(_opts \\ []) do
    GenServer.start_link(__MODULE__, :ok, name: __MODULE__)
  end

  def hash(image_path, opts \\ []) when is_binary(image_path) do
    case hash_paths([image_path], opts) do
      {:ok, %{^image_path => hash}} -> {:ok, hash}
      {:ok, _hashes} -> {:error, "image hash result missing"}
      {:error, reason} -> {:error, reason}
    end
  end

  def hash_paths(paths, opts \\ []) when is_list(paths) do
    GenServer.call(__MODULE__, {:hash_paths, paths, opts}, @read_timeout + 1_000)
  catch
    :exit, {:noproc, _} -> {:error, :not_running}
  end

  @impl true
  def init(:ok) do
    case start_port() do
      {:ok, port} ->
        Logger.info("Image hash daemon ready")
        {:ok, %{port: port}}

      {:error, reason} ->
        Logger.warning("Image hash daemon unavailable: #{reason}")
        {:ok, %{port: nil}}
    end
  end

  @impl true
  def handle_call({:hash_paths, _paths, _opts}, _from, %{port: nil} = state) do
    {:reply, {:error, :not_running}, state}
  end

  def handle_call({:hash_paths, paths, opts}, _from, %{port: port} = state) do
    Port.command(port, "#{Jason.encode!(hash_command(paths, opts))}\n")

    result =
      with data when is_binary(data) <- read_port_result(port),
           {:ok, decoded} <- Jason.decode(String.trim(data)) do
        decode_hashes(decoded)
      else
        {:error, reason} -> {:error, reason}
      end

    {:reply, result, state}
  end

  @impl true
  def handle_info({port, {:exit_status, status}}, %{port: port} = state) do
    Logger.warning("Image hash daemon exited with status #{status}")
    {:stop, "Image hash daemon exited", state}
  end

  def handle_info({port, {:data, data}}, %{port: port} = state) when is_binary(data) do
    if String.trim(data) != "" do
      Logger.warning("Image hash daemon unsolicited output: #{inspect(data)}")
    end

    {:noreply, state}
  end

  def handle_info(_message, state), do: {:noreply, state}

  defp start_port do
    port =
      Port.open({:spawn_executable, rapidocr_python_path()}, [
        :binary,
        :use_stdio,
        :exit_status,
        args: [hash_daemon_script_path()]
      ])

    receive do
      {^port, {:data, "READY\n"}} -> {:ok, port}
      {^port, {:data, _other}} -> {:ok, port}
      {^port, {:exit_status, status}} -> {:error, "exited with status #{status}"}
    after
      5_000 ->
        Port.close(port)
        {:error, "startup timed out"}
    end
  rescue
    exception in ErlangError -> {:error, Exception.message(exception)}
  end

  defp read_port_result(port), do: read_port_result(port, "")

  defp read_port_result(port, buffer) do
    receive do
      {^port, {:data, data}} when is_binary(data) ->
        buffer = buffer <> data

        case complete_line(buffer) do
          {:ok, line} -> line
          :incomplete -> read_port_result(port, buffer)
        end

      {^port, {:exit_status, _status}} ->
        {:error, "Image hash daemon exited unexpectedly"}
    after
      @read_timeout ->
        {:error, "Image hash daemon timed out"}
    end
  end

  defp complete_line(buffer) do
    case String.split(buffer, "\n", parts: 2) do
      [line, _rest] ->
        if String.trim(line) == "" do
          :incomplete
        else
          {:ok, line}
        end

      [_partial] ->
        :incomplete
    end
  end

  defp hash_command(paths, opts) do
    %{
      paths: paths,
      crop: opts |> Keyword.get(:crop, "art") |> to_string()
    }
  end

  defp decode_hashes(decoded) when is_map(decoded) do
    {:ok,
     decoded
     |> Enum.flat_map(fn {path, result} ->
       case result do
         %{"ok" => true, "hash" => hash} when is_binary(hash) -> [{path, hash}]
         _result -> []
       end
     end)
     |> Map.new()}
  end

  defp decode_hashes(_decoded), do: {:error, "invalid image hash daemon output"}

  defp rapidocr_python_path do
    Application.get_env(
      :manavault,
      :rapidocr_python,
      Path.expand(".venv/bin/python", File.cwd!())
    )
  end

  defp hash_daemon_script_path do
    Application.app_dir(:manavault, "priv/image_hash_daemon.py")
  end
end
