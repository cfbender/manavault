defmodule Manavault.CatalogTest do
  use Manavault.DataCase

  alias Manavault.Catalog

  alias Manavault.Catalog.{
    Card,
    CollectionItem,
    Printing,
    ScanItem,
    ScanRecognition,
    ScanSession,
    Sync
  }

  @black_lotus %{
    "id" => "scryfall-printing-1",
    "oracle_id" => "oracle-1",
    "name" => "Black Lotus",
    "type_line" => "Artifact",
    "oracle_text" => "{T}, Sacrifice Black Lotus: Add three mana of any one color.",
    "color_identity" => [],
    "legalities" => %{"vintage" => "restricted"},
    "set" => "lea",
    "set_name" => "Limited Edition Alpha",
    "collector_number" => "232",
    "lang" => "en",
    "finishes" => ["nonfoil"],
    "image_uris" => %{"normal" => "https://example.test/black-lotus.jpg"},
    "prices" => %{"usd" => "100000.00"},
    "released_at" => "1993-08-05"
  }

  @renamed_lotus %{@black_lotus | "name" => "Black Lotus Updated", "prices" => %{"usd" => "1.00"}}

  @time_walk %{
    "id" => "scryfall-printing-2",
    "oracle_id" => "oracle-2",
    "name" => "Time Walk",
    "type_line" => "Sorcery",
    "set" => "lea",
    "set_name" => "Limited Edition Alpha",
    "collector_number" => "84",
    "lang" => "ja",
    "finishes" => ["foil"],
    "released_at" => "1993-08-05"
  }

  test "import_cards stores identities and printings and safely updates on rerun" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])

    assert %Card{name: "Black Lotus", color_identity: "[]"} = Repo.get!(Card, "oracle-1")

    assert %Printing{
             scryfall_id: "scryfall-printing-1",
             oracle_id: "oracle-1",
             set_code: "lea",
             collector_number: "232",
             released_at: ~D[1993-08-05]
           } = Catalog.get_printing_by_scryfall_id("scryfall-printing-1")

    assert %Printing{scryfall_id: "scryfall-printing-1"} = Catalog.get_printing("LEA", "232")
    assert [%Card{oracle_id: "oracle-1"}] = Catalog.search_cards("lotus")

    assert %Card{printings: [%Printing{scryfall_id: "scryfall-printing-1"}]} =
             Catalog.get_card_with_printings("oracle-1")

    assert [%Printing{scryfall_id: "scryfall-printing-1", card: %Card{name: "Black Lotus"}}] =
             Catalog.search_printings(name: "lotus", set_code: "LEA", collector_number: "232")

    assert [] = Catalog.search_printings(name: "", set_code: "", collector_number: "")

    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@renamed_lotus])

    assert Repo.aggregate(Card, :count) == 1
    assert Repo.aggregate(Printing, :count) == 1
    assert %Card{name: "Black Lotus Updated"} = Repo.get!(Card, "oracle-1")
    assert %Printing{prices: prices} = Repo.get!(Printing, "scryfall-printing-1")
    assert Jason.decode!(prices) == %{"usd" => "1.00"}
  end

  test "collection item CRUD persists exact printing inventory" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])

    assert {:ok, %CollectionItem{} = item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => "2",
               "condition" => "lightly_played",
               "language" => "en",
               "finish" => "nonfoil",
               "location_id" => nil,
               "notes" => "First page"
             })

    assert item.quantity == 2
    assert item.scryfall_id == "scryfall-printing-1"

    assert [listed] = Catalog.list_collection_items(q: "lotus")
    assert listed.id == item.id
    assert listed.printing.scryfall_id == "scryfall-printing-1"
    assert listed.printing.card.name == "Black Lotus"

    assert %CollectionItem{} = loaded = Catalog.get_collection_item!(item.id)
    assert loaded.printing.card.name == "Black Lotus"

    assert {:ok, updated} =
             Catalog.update_collection_item(loaded, %{
               "scryfall_id" => "other-printing",
               "quantity" => "3",
               "condition" => "near_mint",
               "language" => "ja",
               "finish" => "nonfoil",
               "location_id" => nil,
               "notes" => "Updated"
             })

    assert updated.quantity == 3
    assert updated.condition == "near_mint"
    assert updated.language == "ja"
    assert updated.finish == "nonfoil"
    assert updated.scryfall_id == "scryfall-printing-1"
    assert updated.location_id == nil
    assert updated.notes == "Updated"

    assert {:error, changeset} =
             Catalog.update_collection_item(updated, %{
               "condition" => "creased",
               "finish" => "gold"
             })

    assert "is invalid" in errors_on(changeset).condition
    assert "is invalid" in errors_on(changeset).finish

    assert {:error, changeset} = Catalog.update_collection_item(updated, %{"finish" => "foil"})
    assert "is not available for this printing" in errors_on(changeset).finish

    assert {:ok, _deleted} = Catalog.delete_collection_item(updated)
    assert [] = Catalog.list_collection_items()
  end

  test "collection item pagination supports deterministic limit and offset" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, _walk} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-2",
               "quantity" => "1",
               "condition" => "near_mint",
               "language" => "ja",
               "finish" => "foil"
             })

    assert {:ok, _lotus} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => "1",
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil"
             })

    assert [%CollectionItem{printing: %{card: %{name: "Black Lotus"}}}] =
             Catalog.list_collection_items([], limit: 1)

    assert [%CollectionItem{printing: %{card: %{name: "Time Walk"}}}] =
             Catalog.list_collection_items([], limit: 1, offset: 1)
  end

  test "collection item filtering supports search and metadata facets" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    {:ok, binder} = Catalog.create_location(%{name: "Trade Binder", kind: "binder"})

    assert {:ok, lotus} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => "1",
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil",
               "location_id" => binder.id
             })

    assert {:ok, walk} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-2",
               "quantity" => "1",
               "condition" => "damaged",
               "language" => "ja",
               "finish" => "foil"
             })

    assert [found] = Catalog.list_collection_items(q: "lotus")
    assert found.id == lotus.id

    assert [found] = Catalog.list_collection_items(q: "84")
    assert found.id == walk.id

    assert [found] = Catalog.list_collection_items(q: "scryfall-printing-2")
    assert found.id == walk.id

    assert [found] = Catalog.list_collection_items(condition: "near_mint")
    assert found.id == lotus.id

    assert [found] = Catalog.list_collection_items(language: "ja", finish: "foil")
    assert found.id == walk.id

    assert [found] = Catalog.list_collection_items(location_id: Integer.to_string(binder.id))
    assert found.id == lotus.id

    assert [found] = Catalog.list_collection_items(location_id: "unfiled")
    assert found.id == walk.id
    assert [] = Catalog.list_collection_items(location_id: "missing")
  end

  test "new_collection_item_for_printing defaults to exact printing language and first finish" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])

    changeset = Catalog.new_collection_item_for_printing("scryfall-printing-1")

    assert changeset.valid?
    assert Ecto.Changeset.get_field(changeset, :scryfall_id) == "scryfall-printing-1"
    assert Ecto.Changeset.get_field(changeset, :language) == "en"
    assert Ecto.Changeset.get_field(changeset, :finish) == "nonfoil"
    assert Ecto.Changeset.get_field(changeset, :quantity) == 1
  end

  test "add_printing_to_collection accepts atom-keyed attrs" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])

    assert {:ok, item} =
             Catalog.add_printing_to_collection("scryfall-printing-1", %{
               quantity: 2,
               condition: "lightly_played",
               language: "en",
               finish: "nonfoil"
             })

    assert item.scryfall_id == "scryfall-printing-1"
    assert item.quantity == 2
  end

  test "scan session CRUD stores defaults and preloads items with multiple candidates" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    {:ok, binder} = Catalog.create_location(%{name: "Scan Binder", kind: "binder"})

    assert {:ok, %ScanSession{} = scan_session} =
             Catalog.create_scan_session(%{
               "name" => "Saturday scans",
               "default_condition" => "lightly_played",
               "default_language" => "ja",
               "default_finish" => "foil",
               "default_location_id" => binder.id
             })

    assert scan_session.status == "open"
    assert scan_session.default_condition == "lightly_played"
    assert scan_session.default_language == "ja"
    assert scan_session.default_finish == "foil"
    assert scan_session.default_location_id == binder.id

    assert {:ok, %ScanItem{} = item} =
             Catalog.create_scan_item(scan_session, %{
               image_path: "/tmp/scan-1.jpg",
               status: "needs_review"
             })

    assert item.condition == "lightly_played"
    assert item.language == "ja"
    assert item.finish == "foil"
    assert item.location_id == binder.id

    assert {:ok, _candidate1} =
             Catalog.create_scan_candidate(item, %{
               printing_id: "scryfall-printing-1",
               oracle_id: "oracle-1",
               source: "ocr",
               confidence: 0.92,
               rank: 1,
               evidence: Jason.encode!(%{name: "Black Lotus"})
             })

    assert {:ok, _candidate2} =
             Catalog.create_scan_candidate(item, %{
               printing_id: "scryfall-printing-2",
               oracle_id: "oracle-2",
               source: "image_match",
               confidence: 0.71,
               rank: 2,
               evidence: Jason.encode!(%{name: "Time Walk"})
             })

    assert [listed] = Catalog.list_scan_sessions()
    assert listed.id == scan_session.id
    assert listed.default_location.name == "Scan Binder"

    loaded = Catalog.get_scan_session!(scan_session.id)
    assert loaded.default_location.name == "Scan Binder"
    assert [loaded_item] = loaded.scan_items
    assert loaded_item.image_path == "/tmp/scan-1.jpg"
    assert loaded_item.location.name == "Scan Binder"
    assert [first, second] = loaded_item.scan_candidates
    assert first.printing.card.name == "Black Lotus"
    assert second.printing.card.name == "Time Walk"

    assert %{pending: [], reviewed: [^loaded_item], accepted: []} =
             Catalog.scan_session_items_by_review_state(loaded)
  end

  test "create_scan_item_from_capture stores a captured image under the configured upload directory" do
    upload_dir =
      Path.join(System.tmp_dir!(), "manavault-captures-#{System.unique_integer([:positive])}")

    previous_dir = Application.get_env(:manavault, :capture_upload_dir)
    Application.put_env(:manavault, :capture_upload_dir, upload_dir)

    on_exit(fn ->
      if previous_dir do
        Application.put_env(:manavault, :capture_upload_dir, previous_dir)
      else
        Application.delete_env(:manavault, :capture_upload_dir)
      end

      File.rm_rf!(upload_dir)
    end)

    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Camera batch"})

    assert {:ok, %ScanItem{} = item} =
             Catalog.create_scan_item_from_capture(
               scan_session,
               "data:image/jpeg;base64,#{Base.encode64("fake image bytes")}"
             )

    assert item.scan_session_id == scan_session.id
    assert item.status == "processing"
    assert item.image_path =~ upload_dir
    assert item.image_path =~ "/scan_sessions/#{scan_session.id}/"
    assert item.image_path =~ ".jpg"
    assert File.read!(item.image_path) == "fake image bytes"
  end

  test "create_scan_item_from_capture rejects invalid image data" do
    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Bad camera batch"})

    assert {:error, "Capture must be a JPEG or PNG data URL."} =
             Catalog.create_scan_item_from_capture(scan_session, "not image data")
  end

  test "recognize_scan_item persists ranked OCR candidates from local Scryfall matches" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Recognition batch"})

    assert {:ok, item} =
             Catalog.create_scan_item(scan_session, %{image_path: "/tmp/black-lotus.jpg"})

    ocr_runner = fn "/tmp/black-lotus.jpg" ->
      {:ok, "Black Lotus\nSet: LEA\nCollector #232\nLanguage: en"}
    end

    assert {:ok, recognized_item} = Catalog.recognize_scan_item(item, ocr_runner: ocr_runner)

    assert recognized_item.status == "recognized"
    assert [candidate] = recognized_item.scan_candidates
    assert candidate.source == "ocr"
    assert candidate.rank == 1
    assert candidate.confidence == 1.0
    assert candidate.printing_id == "scryfall-printing-1"
    assert candidate.oracle_id == "oracle-1"
    assert candidate.printing.card.name == "Black Lotus"

    assert %{
             "parsed_name" => "Black Lotus",
             "parsed_set_code" => "LEA",
             "parsed_collector_number" => "232",
             "matched_name" => "Black Lotus"
           } = Jason.decode!(candidate.evidence)
  end

  test "recognize_scan_item marks failed OCR as needing review with evidence" do
    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Failed recognition"})
    assert {:ok, item} = Catalog.create_scan_item(scan_session, %{image_path: "/tmp/missing.jpg"})

    assert {:error, "tesseract missing", review_item} =
             Catalog.recognize_scan_item(item,
               ocr_runner: fn _path -> {:error, "tesseract missing"} end
             )

    assert review_item.status == "needs_review"
    assert [candidate] = review_item.scan_candidates
    assert candidate.source == "ocr"
    assert candidate.confidence == nil
    assert Jason.decode!(candidate.evidence) == %{"ocr_error" => "tesseract missing"}
  end

  test "scan recognition parses OCR text and matches candidates without OCR runner" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    parsed = ScanRecognition.parse_text("Time Walk\nCollector: 84\nSet: LEA\nLanguage: ja")

    assert parsed.name == "Time Walk"
    assert parsed.collector_number == "84"
    assert parsed.set_code == "LEA"
    assert parsed.language == "ja"

    assert [%{printing: printing, confidence: 1.0}] = ScanRecognition.match_candidates(parsed)
    assert printing.scryfall_id == "scryfall-printing-2"
  end

  test "scan session validations reject invalid defaults and candidates" do
    assert {:error, changeset} =
             Catalog.create_scan_session(%{
               "name" => "Bad scan",
               "default_condition" => "creased",
               "default_finish" => "gold"
             })

    assert "is invalid" in errors_on(changeset).default_condition
    assert "is invalid" in errors_on(changeset).default_finish

    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Valid scan"})
    assert {:ok, item} = Catalog.create_scan_item(scan_session)

    assert {:error, changeset} =
             Catalog.create_scan_candidate(item, %{
               source: "robot",
               confidence: 2.0,
               rank: 0,
               evidence: "{}"
             })

    assert "is invalid" in errors_on(changeset).source
    assert "must be greater than 0" in errors_on(changeset).rank
    assert "must be less than or equal to 1.0" in errors_on(changeset).confidence
  end

  test "sync_scryfall downloads bulk metadata and records success" do
    metadata_url = "https://example.test/metadata"
    download_url = "https://example.test/default-cards.json"

    fetcher = fn
      ^metadata_url -> {:ok, Jason.encode!(%{"download_uri" => download_url})}
      ^download_url -> {:ok, Jason.encode!([@black_lotus])}
    end

    assert {:ok,
            %Sync{
              status: "succeeded",
              cards_count: 1,
              printings_count: 1,
              bulk_uri: ^download_url
            }} =
             Catalog.sync_scryfall(fetcher: fetcher, bulk_url: metadata_url)

    assert %Sync{status: "succeeded"} = Catalog.latest_sync()
    assert Repo.aggregate(Card, :count) == 1
    assert Repo.aggregate(Printing, :count) == 1
  end

  test "sync_scryfall records failures without importing partial catalog data" do
    metadata_url = "https://example.test/metadata"

    fetcher = fn ^metadata_url -> {:error, "network unavailable"} end

    assert {:error, %Sync{status: "failed", error: error}} =
             Catalog.sync_scryfall(fetcher: fetcher, bulk_url: metadata_url)

    assert error == "network unavailable"
    assert Repo.aggregate(Card, :count) == 0
    assert Repo.aggregate(Printing, :count) == 0
  end
end
