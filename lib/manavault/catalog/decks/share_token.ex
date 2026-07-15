defmodule Manavault.Catalog.Decks.ShareToken do
  @moduledoc false

  @byte_size 18
  @encoded_size byte_size(Base.url_encode64(:binary.copy(<<0>>, @byte_size), padding: false))

  def generate do
    @byte_size
    |> :crypto.strong_rand_bytes()
    |> Base.url_encode64(padding: false)
  end

  def valid?(token) when is_binary(token) and byte_size(token) == @encoded_size do
    if url_safe?(token) do
      case Base.url_decode64(token, padding: false) do
        {:ok, decoded} when byte_size(decoded) == @byte_size -> true
        _invalid -> false
      end
    else
      false
    end
  end

  def valid?(_token), do: false

  defp url_safe?(<<>>), do: true

  defp url_safe?(<<character, rest::binary>>)
       when character in ?A..?Z or character in ?a..?z or character in ?0..?9 or character in [?-, ?_],
       do: url_safe?(rest)

  defp url_safe?(_token), do: false
end
