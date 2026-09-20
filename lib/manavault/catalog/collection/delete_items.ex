defmodule Manavault.Catalog.Collection.DeleteItems do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.CollectionItem
  alias Manavault.Repo

  @id_chunk_size 500

  def run(ids) when is_list(ids) do
    Repo.transaction(fn ->
      ids
      |> Enum.chunk_every(@id_chunk_size)
      |> Enum.reduce(0, fn chunk, deleted ->
        {count, _returning} =
          CollectionItem
          |> where([item], item.id in ^chunk)
          |> Repo.delete_all()

        deleted + count
      end)
    end)
  end
end
