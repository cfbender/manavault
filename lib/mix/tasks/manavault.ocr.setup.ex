defmodule Mix.Tasks.Manavault.Ocr.Setup do
  @moduledoc """
  Verifies the local RapidOCR Python environment used by card scanning.
  """

  use Mix.Task

  @shortdoc "Verifies RapidOCR for card scanning"

  @python_path Path.expand(".venv/bin/python", File.cwd!())

  @impl true
  def run(_args) do
    python = Application.get_env(:manavault, :rapidocr_python, @python_path)

    unless File.exists?(python) do
      Mix.raise(missing_rapidocr_message(python))
    end

    engine = System.get_env("MANAVAULT_OCR_ENGINE", "onnxruntime")

    case System.cmd(python, ["-c", import_check(engine)], stderr_to_stdout: true) do
      {_output, 0} ->
        Mix.shell().info("RapidOCR Python environment is ready for #{engine}.")

      {output, _status} ->
        Mix.raise("#{String.trim(output)}\n\n#{missing_rapidocr_message(python)}")
    end
  end

  defp import_check("openvino"), do: "import rapidocr, openvino"
  defp import_check(_engine), do: "import rapidocr, onnxruntime"

  defp missing_rapidocr_message(python) do
    """
    RapidOCR is required for camera card scanning.

    Expected Python executable:

        #{python}

    Install/repair it with:

        python3 -m venv .venv
        .venv/bin/python -m ensurepip --upgrade
        .venv/bin/python -m pip install -r requirements-ocr.txt

    Then rerun:

        mise exec -- mix setup
    """
  end
end
