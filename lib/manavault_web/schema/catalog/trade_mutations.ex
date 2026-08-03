defmodule ManavaultWeb.Schema.Catalog.TradeMutations do
  @moduledoc false

  alias Manavault.Trade
  alias ManavaultWeb.Schema.Catalog.Errors

  def create_trade_want(_parent, args, _resolution) do
    with {:ok, kind, value} <- want_identity(args) do
      quantity = Map.get(args, :quantity)

      case create_want(kind, value, quantity) do
        {:ok, want} -> {:ok, want}
        {:error, :not_found} -> {:error, not_found_message(kind, value)}
        {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
      end
    end
  end

  def ensure_trade_wants_share_token(_parent, _args, _resolution) do
    case Trade.ensure_wants_share_token() do
      {:ok, token} -> {:ok, token}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end

  def ensure_trade_binder_share_token(_parent, _args, _resolution) do
    case Trade.ensure_binder_share_token() do
      {:ok, token} -> {:ok, token}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end

  def update_trade_want(_parent, %{id: id, quantity: quantity}, _resolution) do
    with {:ok, id} <- parse_raw_id(id),
         {:ok, want} <- fetch_want(id) do
      case Trade.update_want_quantity(want, quantity) do
        {:ok, want} -> {:ok, want}
        {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
      end
    end
  end

  def delete_trade_want(_parent, %{id: id}, _resolution) do
    with {:ok, id} <- parse_raw_id(id),
         {:ok, want} <- fetch_want(id) do
      case Trade.delete_want(want) do
        {:ok, want} -> {:ok, want.id}
        {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
      end
    end
  end

  defp fetch_want(id) do
    {:ok, Trade.get_want!(id)}
  rescue
    Ecto.NoResultsError -> {:error, "Want was not found."}
  end

  defp parse_raw_id(id) when is_integer(id), do: {:ok, id}

  defp parse_raw_id(id) when is_binary(id) do
    case Integer.parse(id) do
      {parsed, ""} -> {:ok, parsed}
      _other -> {:error, "Invalid ID: #{id}"}
    end
  end

  defp want_identity(%{name: name, scryfall_id: scryfall_id})
       when is_binary(name) and is_binary(scryfall_id) do
    {:error, "Provide either name or scryfall_id, not both."}
  end

  defp want_identity(%{name: name}) when is_binary(name), do: {:ok, :name, name}

  defp want_identity(%{scryfall_id: scryfall_id}) when is_binary(scryfall_id),
    do: {:ok, :scryfall_id, scryfall_id}

  defp want_identity(_args), do: {:error, "Provide a name or a scryfall_id."}

  defp create_want(:name, name, quantity), do: Trade.create_want_by_name(name, quantity)

  defp create_want(:scryfall_id, scryfall_id, quantity),
    do: Trade.create_want_by_printing(scryfall_id, quantity)

  defp not_found_message(:name, name), do: "No card found named \"#{name}\"."

  defp not_found_message(:scryfall_id, scryfall_id),
    do: "No printing found for \"#{scryfall_id}\"."
end
