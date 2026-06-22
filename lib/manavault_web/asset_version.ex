defmodule ManavaultWeb.AssetVersion do
  @moduledoc false

  @env_vars ~w(MANAVAULT_ASSET_VERSION SOURCE_VERSION GITHUB_SHA RENDER_GIT_COMMIT)

  def current do
    @env_vars
    |> Enum.find_value(&normalized_env/1)
    |> Kernel.||(app_version())
  end

  defp normalized_env(name) do
    name
    |> System.get_env()
    |> normalize()
  end

  defp normalize(nil), do: nil

  defp normalize(value) do
    value =
      value
      |> String.trim()
      |> String.slice(0, 40)
      |> String.replace(~r/[^A-Za-z0-9._-]/, "-")

    if value == "", do: nil, else: value
  end

  defp app_version do
    :manavault
    |> Application.spec(:vsn)
    |> to_string()
    |> normalize()
  end
end
