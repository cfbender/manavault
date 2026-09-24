defmodule ManavaultWeb.Schema.AppearanceResolvers do
  alias Manavault.Appearance

  def appearance_settings(_parent, _args, _resolution) do
    {:ok, serialize_settings(Appearance.settings())}
  end

  def update_appearance_settings(_parent, args, _resolution) do
    case Appearance.update_settings(args) do
      {:ok, settings} -> {:ok, serialize_settings(settings)}
      {:error, changeset} -> {:error, changeset_error_message(changeset)}
    end
  end

  defp serialize_settings(settings) do
    %{palette: settings.palette, theme_style: settings.theme_style}
  end

  defp changeset_error_message(changeset) do
    changeset
    |> Ecto.Changeset.traverse_errors(fn {message, opts} ->
      Enum.reduce(opts, message, fn {key, value}, acc ->
        String.replace(acc, "%{#{key}}", to_string(value))
      end)
    end)
    |> Enum.map_join(", ", fn {field, messages} -> "#{field} #{Enum.join(messages, ", ")}" end)
  end
end
