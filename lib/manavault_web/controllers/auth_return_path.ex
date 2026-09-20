defmodule ManavaultWeb.AuthReturnPath do
  @moduledoc false

  def sanitize(path) when is_binary(path) do
    if local_absolute_path?(path) and decoded_variants_safe?(path), do: path, else: "/"
  rescue
    _ -> "/"
  end

  def sanitize(_path), do: "/"

  defp local_absolute_path?(path) do
    String.valid?(path) and
      safe_path_characters?(path) and
      valid_percent_encoding?(path) and
      absolute_path_uri?(path)
  end

  defp absolute_path_uri?(path) do
    case URI.new(path) do
      {:ok, %URI{scheme: nil, userinfo: nil, host: nil, port: nil, path: uri_path}}
      when is_binary(uri_path) ->
        single_slash_path?(uri_path)

      _ ->
        false
    end
  end

  defp decoded_variants_safe?(path) do
    path
    |> decoded_variants()
    |> Enum.all?(&normalized_absolute_path?/1)
  end

  defp decoded_variants(path) do
    percent_decoded = URI.decode(path)
    form_decoded = URI.decode_www_form(path)

    [
      path,
      percent_decoded,
      form_decoded,
      URI.decode(percent_decoded),
      URI.decode_www_form(percent_decoded),
      URI.decode(form_decoded),
      URI.decode_www_form(form_decoded)
    ]
  end

  defp normalized_absolute_path?(path) do
    String.valid?(path) and safe_path_characters?(path) and single_slash_path?(path)
  end

  defp single_slash_path?(path) do
    String.starts_with?(path, "/") and not String.starts_with?(path, "//")
  end

  defp safe_path_characters?(path), do: not contains_unsafe_path_character?(path)

  defp contains_unsafe_path_character?(<<>>), do: false

  defp contains_unsafe_path_character?(<<character, _rest::binary>>)
       when character <= 31 or character == 127 or character == ?\\,
       do: true

  defp contains_unsafe_path_character?(<<_character, rest::binary>>) do
    contains_unsafe_path_character?(rest)
  end

  defp valid_percent_encoding?(<<>>), do: true

  defp valid_percent_encoding?(<<?%, first, second, rest::binary>>)
       when (first in ?0..?9 or first in ?a..?f or first in ?A..?F) and
              (second in ?0..?9 or second in ?a..?f or second in ?A..?F) do
    valid_percent_encoding?(rest)
  end

  defp valid_percent_encoding?(<<?%, _rest::binary>>), do: false

  defp valid_percent_encoding?(<<_character, rest::binary>>) do
    valid_percent_encoding?(rest)
  end
end
