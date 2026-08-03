defmodule ManavaultWeb.PublicBinderShareTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus, :black_lotus_beta, :time_walk]

  alias Manavault.Catalog
  alias Manavault.Trade

  @query """
  query BinderList($id: ID!) {
    binderList(id: $id) {
      entries {
        cardName
        quantity
        typeLine
        setCode
        collectorNumber
        imageUrl
        finish
        condition
      }
    }
  }
  """

  setup do
    assert {:ok, %{cards_count: 3, printings_count: 3}} =
             Catalog.import_cards([@black_lotus, @black_lotus_beta, @time_walk])

    :ok
  end

  test "returns entries for a valid, matching share token" do
    assert {:ok, _lotus} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => 2,
               "for_trade" => true
             })

    assert {:ok, _walk} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-2",
               "quantity" => 1,
               "finish" => "foil",
               "condition" => "lightly_played",
               "for_trade" => true
             })

    assert {:ok, token} = Trade.ensure_binder_share_token()

    assert {:ok, %{data: %{"binderList" => %{"entries" => entries}}}} =
             Absinthe.run(@query, ManavaultWeb.PublicShareSchema, variables: %{"id" => token})

    assert length(entries) == 2

    lotus_entry = Enum.find(entries, &(&1["cardName"] == "Black Lotus"))

    assert lotus_entry == %{
             "cardName" => "Black Lotus",
             "quantity" => 2,
             "typeLine" => "Artifact",
             "setCode" => "lea",
             "collectorNumber" => "232",
             "imageUrl" => "https://example.test/black-lotus.jpg",
             "finish" => "nonfoil",
             "condition" => "near_mint"
           }

    walk_entry = Enum.find(entries, &(&1["cardName"] == "Time Walk"))

    assert walk_entry == %{
             "cardName" => "Time Walk",
             "quantity" => 1,
             "typeLine" => "Sorcery",
             "setCode" => "lea",
             "collectorNumber" => "84",
             "imageUrl" => nil,
             "finish" => "foil",
             "condition" => "lightly_played"
           }
  end

  test "returns nil for a token that doesn't match the stored share token" do
    assert {:ok, _item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "for_trade" => true
             })

    assert {:ok, _token} = Trade.ensure_binder_share_token()

    assert {:ok, %{data: %{"binderList" => nil}}} =
             Absinthe.run(@query, ManavaultWeb.PublicShareSchema,
               variables: %{"id" => "not-a-real-token"}
             )
  end

  test "returns nil before any share token has ever been created" do
    assert {:ok, %{data: %{"binderList" => nil}}} =
             Absinthe.run(@query, ManavaultWeb.PublicShareSchema,
               variables: %{"id" => "not-a-real-token"}
             )
  end
end
