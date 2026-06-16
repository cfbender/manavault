defmodule ManavaultWeb.CollectionLiveTest do
  use ManavaultWeb.ConnCase

  import Phoenix.LiveViewTest

  alias Manavault.Catalog

  @black_lotus %{
    "id" => "scryfall-printing-1",
    "oracle_id" => "oracle-1",
    "name" => "Black Lotus",
    "type_line" => "Artifact",
    "oracle_text" => "{T}, Sacrifice Black Lotus: Add three mana of any one color.",
    "set" => "lea",
    "set_name" => "Limited Edition Alpha",
    "collector_number" => "232",
    "lang" => "en",
    "finishes" => ["nonfoil"],
    "image_uris" => %{"normal" => "https://example.test/black-lotus.jpg"},
    "prices" => %{"usd" => "100000.00"},
    "released_at" => "1993-08-05"
  }

  @black_lotus_beta %{
    @black_lotus
    | "id" => "scryfall-printing-3",
      "set" => "leb",
      "set_name" => "Limited Edition Beta",
      "collector_number" => "233",
      "lang" => "ja",
      "prices" => %{"usd" => "95000.00"},
      "released_at" => "1993-10-04"
  }

  @time_walk %{
    "id" => "scryfall-printing-2",
    "oracle_id" => "oracle-2",
    "name" => "Time Walk",
    "type_line" => "Sorcery",
    "set" => "lea",
    "set_name" => "Limited Edition Alpha",
    "collector_number" => "84",
    "lang" => "en",
    "finishes" => ["nonfoil"],
    "released_at" => "1993-08-05"
  }

  setup do
    assert {:ok, %{cards_count: 3, printings_count: 3}} =
             Catalog.import_cards([@black_lotus, @black_lotus_beta, @time_walk])

    :ok
  end

  describe "collection index" do
    test "shows locations and unfiled cards", %{conn: conn} do
      # Create a location with some cards
      {:ok, binder} = Catalog.create_location(%{name: "Trade Binder", kind: "binder"})

      assert {:ok, _item} =
               Catalog.create_collection_item(%{
                 "scryfall_id" => "scryfall-printing-1",
                 "quantity" => "1",
                 "condition" => "near_mint",
                 "language" => "en",
                 "finish" => "nonfoil",
                 "location_id" => binder.id
               })

      # Leave one item unfiled (no location)
      assert {:ok, _item2} =
               Catalog.create_collection_item(%{
                 "scryfall_id" => "scryfall-printing-2",
                 "quantity" => "1",
                 "condition" => "near_mint",
                 "language" => "en",
                 "finish" => "nonfoil"
               })

      {:ok, _view, html} = live(conn, ~p"/collection")

      assert html =~ "Collection"
      assert html =~ "Trade Binder"
      assert html =~ "Binder"
      assert html =~ "1 cards"

      # Unfiled section
      assert html =~ "Unfiled cards"
      assert html =~ "Time Walk"
    end

    test "shows empty state when no locations", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/collection")

      assert html =~ "No locations yet"
    end
  end

  describe "location detail" do
    test "shows card image grid for a location", %{conn: conn} do
      {:ok, binder} = Catalog.create_location(%{name: "Trade Binder", kind: "binder"})

      assert {:ok, item} =
               Catalog.create_collection_item(%{
                 "scryfall_id" => "scryfall-printing-1",
                 "quantity" => "2",
                 "condition" => "lightly_played",
                 "language" => "en",
                 "finish" => "nonfoil",
                 "location_id" => binder.id
               })

      {:ok, view, html} = live(conn, ~p"/collection/locations/#{binder.id}")

      assert html =~ "Trade Binder"
      assert html =~ "Binder"
      assert html =~ "Black Lotus"
      assert html =~ "LEA"
      assert html =~ "$100000"
      assert html =~ "×2"
      assert html =~ "Edit"
      assert html =~ "Change printing"
      refute html =~ "LEA #232"
      refute html =~ "Lightly played"

      html =
        view
        |> element(~s|#collection-item-#{item.id} button[phx-click="show_details"]|)
        |> render_click()

      assert html =~ "LEA #232"
      assert html =~ "Lightly played"
      assert html =~ "Scryfall ID"
    end

    test "changes a collection item printing from modal", %{conn: conn} do
      {:ok, binder} = Catalog.create_location(%{name: "Trade Binder", kind: "binder"})

      assert {:ok, item} =
               Catalog.create_collection_item(%{
                 "scryfall_id" => "scryfall-printing-1",
                 "quantity" => "1",
                 "condition" => "near_mint",
                 "language" => "en",
                 "finish" => "nonfoil",
                 "location_id" => binder.id
               })

      {:ok, view, html} = live(conn, ~p"/collection/locations/#{binder.id}")

      assert html =~ "LEA"
      refute html =~ "LEB #233"

      html =
        view
        |> element(~s|#collection-item-#{item.id} button[phx-click="change_printing"]|)
        |> render_click()

      assert html =~ "Change printing"
      assert html =~ "LEA #232"
      assert html =~ "LEB #233"
      assert html =~ "Current printing"
      assert html =~ "Select printing"
      refute html =~ "Delete"

      html =
        view
        |> element(~s|button[phx-click="switch_printing"][phx-value-scryfall_id="scryfall-printing-3"]|)
        |> render_click()

      assert html =~ "LEB"
      assert html =~ "$95000"
      refute html =~ "LEA #232"

      updated = Catalog.get_collection_item!(item.id)
      assert updated.scryfall_id == "scryfall-printing-3"
      assert updated.language == "ja"
    end

    test "searches within location", %{conn: conn} do
      {:ok, binder} = Catalog.create_location(%{name: "Trade Binder", kind: "binder"})

      assert {:ok, _item} =
               Catalog.create_collection_item(%{
                 "scryfall_id" => "scryfall-printing-1",
                 "quantity" => "1",
                 "condition" => "near_mint",
                 "language" => "en",
                 "finish" => "nonfoil",
                 "location_id" => binder.id
               })

      assert {:ok, _item2} =
               Catalog.create_collection_item(%{
                 "scryfall_id" => "scryfall-printing-2",
                 "quantity" => "1",
                 "condition" => "near_mint",
                 "language" => "en",
                 "finish" => "nonfoil",
                 "location_id" => binder.id
               })

      {:ok, view, _html} = live(conn, ~p"/collection/locations/#{binder.id}")

      html =
        view
        |> form("form[phx-submit=search]", search: %{q: "lotus"})
        |> render_submit()

      assert html =~ "Black Lotus"
      refute html =~ "Time Walk"
    end

    test "deletes item from location", %{conn: conn} do
      {:ok, binder} = Catalog.create_location(%{name: "Trade Binder", kind: "binder"})

      assert {:ok, item} =
               Catalog.create_collection_item(%{
                 "scryfall_id" => "scryfall-printing-1",
                 "quantity" => "1",
                 "condition" => "near_mint",
                 "language" => "en",
                 "finish" => "nonfoil",
                 "location_id" => binder.id
               })

      {:ok, view, _html} = live(conn, ~p"/collection/locations/#{binder.id}")

      render_click(element(view, "#collection-item-#{item.id} button", "Delete"))

      refute has_element?(view, "#collection-item-#{item.id}")
    end

    test "shows empty location message", %{conn: conn} do
      {:ok, binder} = Catalog.create_location(%{name: "Empty Box", kind: "box"})

      {:ok, _view, html} = live(conn, ~p"/collection/locations/#{binder.id}")

      assert html =~ "Empty Box"
      assert html =~ "This location is empty"
    end
  end

  describe "collection form" do
    test "adds an exact printing to the collection with location", %{conn: conn} do
      {:ok, _binder} = Catalog.create_location(%{name: "Trade Binder", kind: "binder"})

      {:ok, view, html} = live(conn, ~p"/collection/new?printing_id=scryfall-printing-1")

      assert html =~ "Add to collection"
      assert html =~ "Black Lotus"
      assert html =~ "Trade Binder"

      view
      |> form("#collection-item-form",
        collection_item: %{
          scryfall_id: "scryfall-printing-1",
          quantity: "2",
          condition: "lightly_played",
          language: "en",
          finish: "nonfoil",
          location_id: ""
        }
      )
      |> render_submit()

      assert_redirect(view, ~p"/collection")

      assert [item] = Catalog.list_collection_items()
      assert item.quantity == 2
      assert item.location_id == nil
      assert item.printing.card.name == "Black Lotus"
    end

    test "edits a collection item and changes location", %{conn: conn} do
      {:ok, binder} = Catalog.create_location(%{name: "Trade Binder", kind: "binder"})

      assert {:ok, item} =
               Catalog.create_collection_item(%{
                 "scryfall_id" => "scryfall-printing-1",
                 "quantity" => "1",
                 "condition" => "near_mint",
                 "language" => "en",
                 "finish" => "nonfoil"
               })

      {:ok, edit_view, html} = live(conn, ~p"/collection/#{item.id}/edit")

      assert html =~ "Edit collection item"
      assert html =~ "Black Lotus"

      edit_view
      |> form("#collection-item-form",
        collection_item: %{
          quantity: "4",
          condition: "damaged",
          language: "ja",
          finish: "nonfoil",
          location_id: binder.id
        }
      )
      |> render_submit()

      assert_redirect(edit_view, ~p"/collection")

      updated = Catalog.get_collection_item!(item.id)
      assert updated.quantity == 4
      assert updated.location_id == binder.id
    end
  end
end
