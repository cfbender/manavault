defmodule Manavault.Catalog.EDHRec.Response.CardLookupPreloadTest do
  use Manavault.DataCase, async: true

  alias Manavault.Catalog.Card
  alias Manavault.Catalog.EDHRec.Response.CardLookup

  setup do
    {:ok, card} =
      %Card{}
      |> Card.changeset(%{
        oracle_id: "oracle-sol-ring",
        name: "Sol Ring",
        type_line: "Artifact"
      })
      |> Repo.insert()

    %{card: card}
  end

  test "local_card resolves by oracle_id without eagerly loading printings", %{card: card} do
    assert %Card{oracle_id: "oracle-sol-ring"} = found = CardLookup.local_card(card.oracle_id, "")

    # Printings must stay unloaded so the batched GraphQL dataloader handles them.
    assert %Ecto.Association.NotLoaded{} = found.printings
  end

  test "local_card resolves by name without eagerly loading printings" do
    assert %Card{oracle_id: "oracle-sol-ring"} = found = CardLookup.local_card(nil, "sol ring")
    assert %Ecto.Association.NotLoaded{} = found.printings
  end
end
