defmodule Manavault.Catalog.Tokens.KnownBacks do
  @moduledoc """
  Which tokens are printed on the back of which, from `priv/data/token_backs.json`.

  Scryfall lists most double-sided precon tokens as separate single-faced
  printings, so the pairings come from Wizards' card image galleries, which
  show both faces. Pairs are undirected and keyed by `"<set_code>/<collector
  number>"`; a printing can have several known backs when the same front ships
  in more than one product.
  """

  @path Path.expand("../../../../priv/data/token_backs.json", __DIR__)
  @external_resource @path

  @pairs @path |> File.read!() |> Jason.decode!() |> Map.fetch!("pairs")

  @backs_by_face Enum.reduce(@pairs, %{}, fn %{"front" => front, "back" => back}, acc ->
                   acc
                   |> Map.update(front, [back], &(&1 ++ [back]))
                   |> Map.update(back, [front], &(&1 ++ [front]))
                 end)

  @type face_key :: {set_code :: String.t(), collector_number :: String.t()}

  @doc "Every known pairing, as stored."
  @spec pairs() :: [%{String.t() => String.t()}]
  def pairs, do: @pairs

  @doc """
  `{set_code, collector_number}` of each token known to be printed on the back
  of the given face, in data-file order. Empty when the face has no known back.
  """
  @spec back_keys(String.t(), String.t()) :: [face_key()]
  def back_keys(set_code, collector_number)
      when is_binary(set_code) and is_binary(collector_number) do
    @backs_by_face
    |> Map.get(set_code <> "/" <> collector_number, [])
    |> Enum.map(&parse_key/1)
  end

  defp parse_key(key) do
    [set_code, collector_number] = String.split(key, "/", parts: 2)
    {set_code, collector_number}
  end
end
