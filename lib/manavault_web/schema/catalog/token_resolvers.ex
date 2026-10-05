defmodule ManavaultWeb.Schema.Catalog.TokenResolvers do
  @moduledoc false

  alias Manavault.Catalog
  alias ManavaultWeb.Schema.Catalog.Errors
  alias ManavaultWeb.Schema.RelayHelpers

  def token_items(_parent, args, _resolution) do
    {:ok, Catalog.list_token_items(q: Map.get(args, :q, ""))}
  end

  def token_item_count(_parent, _args, _resolution) do
    {:ok, Catalog.count_token_items()}
  end

  # Like `scannerPrintings`, this takes raw Scryfall IDs: the scanner has only
  # the recognized printing's Scryfall ID when it asks for possible back faces.
  def token_printings(_parent, args, _resolution) do
    printings =
      Catalog.search_token_printings(
        [
          q: Map.get(args, :q, ""),
          set_code: Map.get(args, :set_code, ""),
          exclude_scryfall_id: Map.get(args, :exclude_scryfall_id)
        ],
        limit: args |> Map.get(:limit, 60) |> min(200)
      )

    {:ok, printings}
  end

  def add_token_item(_parent, %{input: input}, resolution) do
    with {:ok, input} <-
           RelayHelpers.put_optional_node_id(input, :scryfall_id, :printing, resolution),
         {:ok, input} <-
           RelayHelpers.put_optional_node_id(input, :back_scryfall_id, :printing, resolution) do
      case Catalog.add_token_item(input) do
        {:ok, item} -> {:ok, item}
        {:error, :not_a_token} -> {:error, "That printing is not a token."}
        {:error, :printing_not_found} -> {:error, "Token printing not found."}
        {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
      end
    end
  end

  def update_token_item(_parent, %{id: id, input: input}, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :token_item, resolution) do
      item = Catalog.get_token_item!(id)

      case Catalog.update_token_item(item, input) do
        {:ok, item} -> {:ok, item}
        {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
      end
    end
  end

  def delete_token_item(_parent, %{id: id}, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :token_item, resolution) do
      item = Catalog.get_token_item!(id)

      case Catalog.delete_token_item(item) do
        {:ok, item} -> {:ok, item}
        {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
      end
    end
  end
end
