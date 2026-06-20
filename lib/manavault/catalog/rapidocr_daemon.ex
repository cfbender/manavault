defmodule Manavault.Catalog.RapidOCRDaemon do
  @moduledoc """
  Persistent RapidOCR process — starts a Python daemon that loads the model once
  and stays alive to process images without reloading.

  Uses an Elixir Port for stdin/stdout communication with the Python process.
  """

  use GenServer
  require Logger

  @read_timeout 60_000

  # --- Public API ---

  def start_link(_opts \\ []) do
    GenServer.start_link(__MODULE__, :ok, name: __MODULE__)
  end

  @doc """
  Runs OCR on the given image path. Returns {:ok, text} or {:error, reason}.
  Falls back to calling the daemon's synchronous path if the port is available.
  """
  def recognize(image_path, opts \\ []) do
    GenServer.call(__MODULE__, {:recognize, image_path, opts}, @read_timeout + 10_000)
  end

  # --- GenServer callbacks ---

  @impl true
  def init(:ok) do
    case start_port() do
      {:ok, port} ->
        Logger.info(
          "RapidOCR daemon ready engine=#{System.get_env("MANAVAULT_OCR_ENGINE", "onnxruntime")} " <>
            "title_width=#{System.get_env("MANAVAULT_OCR_TITLE_WIDTH", "640")}"
        )

        {:ok, %{port: port}}

      {:error, reason} ->
        Logger.warning("RapidOCR daemon unavailable: #{reason}")
        {:ok, %{port: nil}}
    end
  end

  defp start_port do
    port =
      Port.open({:spawn_executable, rapidocr_python_path()}, [
        :binary,
        :use_stdio,
        :exit_status,
        args: [rapidocr_script_path()]
      ])

    receive do
      {^port, {:data, "READY\n"}} ->
        {:ok, port}

      {^port, {:data, _other}} ->
        {:ok, port}

      {^port, {:exit_status, status}} ->
        {:error, "exited with status #{status}"}
    after
      15_000 ->
        Port.close(port)
        {:error, "startup timed out"}
    end
  rescue
    e in ErlangError ->
      {:error, Exception.message(e)}
  end

  defp rapidocr_python_path do
    Application.get_env(
      :manavault,
      :rapidocr_python,
      Path.expand(".venv/bin/python", File.cwd!())
    )
  end

  defp rapidocr_script_path do
    Application.app_dir(:manavault, "priv/rapidocr_daemon.py")
  end

  @impl true
  def handle_call({:recognize, _image_path, _opts}, _from, %{port: nil} = state) do
    {:reply, :not_running, state}
  end

  def handle_call({:recognize, image_path, opts}, _from, %{port: port} = state) do
    Port.command(port, "#{Jason.encode!(ocr_command(image_path, opts))}\n")

    result =
      receive do
        {^port, {:data, data}} ->
          data

        {^port, {:exit_status, _status}} ->
          {:error, "RapidOCR daemon exited unexpectedly"}
      after
        @read_timeout ->
          {:error, "RapidOCR daemon timed out"}
      end

    case result do
      {:error, reason} ->
        {:reply, {:error, reason}, state}

      data when is_binary(data) ->
        case Jason.decode(String.trim(data)) do
          {:ok, lines} when is_list(lines) ->
            {:reply, {:ok, Enum.join(lines, "\n")}, state}

          {:ok, %{"error" => error}} ->
            {:reply, {:error, error}, state}

          other ->
            Logger.warning("RapidOCR unexpected output: #{inspect(other)}")
            {:reply, {:error, "unexpected OCR output"}, state}
        end
    end
  end

  defp ocr_command(image_path, opts) do
    %{
      path: image_path,
      crop: opts |> Keyword.get(:ocr_crop, :full) |> to_string()
    }
  end

  @impl true
  def handle_info({port, {:exit_status, status}}, %{port: port} = state) do
    Logger.warning("RapidOCR daemon exited with status #{status}, restarting")
    {:stop, "RapidOCR daemon exited", state}
  end

  @impl true
  def terminate(_reason, %{port: nil}), do: :ok

  def terminate(_reason, %{port: port}) do
    Port.close(port)
    :ok
  end
end
