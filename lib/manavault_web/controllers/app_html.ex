defmodule ManavaultWeb.AppHTML do
  use ManavaultWeb, :html

  embed_templates "app_html/*"

  defp present?(value), do: not is_nil(value) and value != ""
end
