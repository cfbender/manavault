defmodule ManavaultWeb.Schema.ApiKeyOperations do
  use Absinthe.Schema.Notation

  alias Manavault.Auth.ApiKeys

  object :api_key_queries do
    field :api_keys, non_null(list_of(non_null(:api_key))) do
      resolve(fn _, _, _ -> {:ok, ApiKeys.list()} end)
    end
  end

  object :api_key_mutations do
    field :create_api_key, non_null(:created_api_key) do
      arg(:name, non_null(:string))

      resolve(fn _, %{name: name}, _ ->
        case ApiKeys.create(name) do
          {:ok, api_key, token} -> {:ok, %{api_key: api_key, token: token}}
          {:error, %Ecto.Changeset{} = changeset} -> {:error, changeset_errors(changeset)}
          {:error, _reason} -> {:error, "Could not create API key"}
        end
      end)
    end

    field :revoke_api_key, non_null(:api_key) do
      arg(:id, non_null(:id))

      resolve(fn _, %{id: id}, _ ->
        case ApiKeys.revoke(id) do
          {:ok, api_key} -> {:ok, api_key}
          {:error, :not_found} -> {:error, "API key not found"}
          {:error, _reason} -> {:error, "Could not revoke API key"}
        end
      end)
    end
  end

  defp changeset_errors(changeset) do
    changeset
    |> Ecto.Changeset.traverse_errors(fn {message, opts} ->
      Enum.reduce(opts, message, fn {key, value}, text ->
        String.replace(text, "%{#{key}}", to_string(value))
      end)
    end)
    |> Map.values()
    |> List.flatten()
    |> Enum.join(", ")
  end
end
