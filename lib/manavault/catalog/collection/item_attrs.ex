defmodule Manavault.Catalog.Collection.ItemAttrs do
  @moduledoc false

  alias Ecto.Changeset
  alias Manavault.Catalog.{CollectionItem, Finishes, Price, Printing, Search}
  alias Manavault.Repo

  def switch(%CollectionItem{} = collection_item, scryfall_id) do
    case Search.get_printing_by_scryfall_id(scryfall_id) do
      nil ->
        %{
          "scryfall_id" => scryfall_id,
          "language" => collection_item.language,
          "finish" => collection_item.finish
        }

      %Printing{} = printing ->
        %{
          "scryfall_id" => scryfall_id,
          "language" => printing.lang || collection_item.language || "en",
          "finish" => Finishes.preferred(printing, collection_item.finish)
        }
    end
  end

  def default_for_printing(%Printing{} = printing) do
    %{
      scryfall_id: printing.scryfall_id,
      language: printing.lang || "en",
      finish: Finishes.first(printing.finishes),
      quantity: 1,
      condition: "near_mint",
      purchase_price_cents:
        Price.price_cents_for_printing(printing, Finishes.first(printing.finishes))
    }
  end

  def normalize(attrs) do
    attrs
    |> Map.new(fn {key, value} -> {to_string(key), value} end)
    |> normalize_purchase_price_cents()
  end

  def put_default_purchase_price(%{"purchase_price_cents" => value} = attrs)
      when value not in [nil, ""],
      do: attrs

  def put_default_purchase_price(attrs) do
    scryfall_id = Map.get(attrs, "scryfall_id")

    with true <- is_binary(scryfall_id),
         %Printing{} = printing <- Search.get_printing_by_scryfall_id(scryfall_id),
         finish <- Map.get(attrs, "finish") || Finishes.first(printing.finishes),
         cents when is_integer(cents) <- Price.price_cents_for_printing(printing, finish) do
      Map.put(attrs, "purchase_price_cents", cents)
    else
      _unknown -> attrs
    end
  end

  def validate_finish_available(changeset) do
    scryfall_id = Changeset.get_field(changeset, :scryfall_id)
    finish = Changeset.get_field(changeset, :finish)

    with true <- changeset.valid?,
         true <- is_binary(scryfall_id),
         true <- is_binary(finish),
         %Printing{} = printing <- Repo.get(Printing, scryfall_id),
         finishes <- Finishes.list(printing.finishes),
         false <- finish in finishes do
      Changeset.add_error(changeset, :finish, "is not available for this printing")
    else
      _other -> changeset
    end
  end

  defp normalize_purchase_price_cents(%{"purchase_price_cents" => value} = attrs)
       when is_binary(value) do
    cond do
      String.trim(value) == "" ->
        Map.put(attrs, "purchase_price_cents", nil)

      cents = Price.parse_cents(value) ->
        Map.put(attrs, "purchase_price_cents", cents)

      true ->
        attrs
    end
  end

  defp normalize_purchase_price_cents(attrs), do: attrs
end
