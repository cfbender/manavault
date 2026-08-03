defmodule ManavaultWeb.PublicWantsShareTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus, :black_lotus_beta, :time_walk]

  alias Manavault.Catalog
  alias Manavault.Trade

  @query """
  query WantsList($id: ID!) {
    wantsList(id: $id) {
      entries {
        cardName
        quantity
        typeLine
        setCode
        collectorNumber
        imageUrl
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
    assert {:ok, _generic} = Trade.create_want_by_name("Time Walk", 3)
    assert {:ok, _specific} = Trade.create_want_by_printing("scryfall-printing-3", 1)
    assert {:ok, token} = Trade.ensure_wants_share_token()

    assert {:ok, %{data: %{"wantsList" => %{"entries" => entries}}}} =
             Absinthe.run(@query, ManavaultWeb.PublicShareSchema, variables: %{"id" => token})

    assert length(entries) == 2

    walk_entry = Enum.find(entries, &(&1["cardName"] == "Time Walk"))

    assert walk_entry == %{
             "cardName" => "Time Walk",
             "quantity" => 3,
             "typeLine" => "Sorcery",
             "setCode" => nil,
             "collectorNumber" => nil,
             "imageUrl" => nil
           }

    lotus_entry = Enum.find(entries, &(&1["cardName"] == "Black Lotus"))

    assert lotus_entry == %{
             "cardName" => "Black Lotus",
             "quantity" => 1,
             "typeLine" => "Artifact",
             "setCode" => "leb",
             "collectorNumber" => "233",
             "imageUrl" => "https://example.test/black-lotus.jpg"
           }
  end

  test "a rotated token immediately stops resolving" do
    assert {:ok, old_token} = Trade.ensure_wants_share_token()
    assert {:ok, new_token} = Trade.rotate_wants_share_token()

    assert {:ok, %{data: %{"wantsList" => nil}}} =
             Absinthe.run(@query, ManavaultWeb.PublicShareSchema, variables: %{"id" => old_token})

    assert {:ok, %{data: %{"wantsList" => %{"entries" => []}}}} =
             Absinthe.run(@query, ManavaultWeb.PublicShareSchema, variables: %{"id" => new_token})
  end

  test "returns nil for a token that doesn't match the stored share token" do
    assert {:ok, _want} = Trade.create_want_by_name("Black Lotus")
    assert {:ok, _token} = Trade.ensure_wants_share_token()

    assert {:ok, %{data: %{"wantsList" => nil}}} =
             Absinthe.run(@query, ManavaultWeb.PublicShareSchema,
               variables: %{"id" => "not-a-real-token"}
             )
  end

  test "returns nil before any share token has ever been created" do
    assert {:ok, %{data: %{"wantsList" => nil}}} =
             Absinthe.run(@query, ManavaultWeb.PublicShareSchema,
               variables: %{"id" => "not-a-real-token"}
             )
  end
end
