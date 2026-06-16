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

  test "scan session CRUD stores defaults and preloads items without candidate rows" do
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

    assert [listed] = Catalog.list_scan_sessions()
    assert listed.id == scan_session.id
    assert listed.default_location.name == "Scan Binder"

    loaded = Catalog.get_scan_session!(scan_session.id)
    assert loaded.default_location.name == "Scan Binder"
    assert [loaded_item] = loaded.scan_items
    assert loaded_item.image_path == "/tmp/scan-1.jpg"
    assert loaded_item.location.name == "Scan Binder"

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

  test "create_recognized_scan_item_from_capture stores only matched card captures" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    upload_dir =
      Path.join(
        System.tmp_dir!(),
        "manavault-recognized-captures-#{System.unique_integer([:positive])}"
      )

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

    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Matched camera batch"})

    assert {:ok, item} =
             Catalog.create_recognized_scan_item_from_capture(
               scan_session,
               "data:image/png;base64,#{Base.encode64("fake image bytes")}",
               ocr_runner: fn _path -> {:ok, "Black Lotus\nSet: LEA\nCollector #232"} end
             )

    assert item.status == "recognized"
    assert item.image_path =~ upload_dir
    assert item.accepted_printing_id == "scryfall-printing-1"
    assert [loaded_item] = Catalog.get_scan_session!(scan_session.id).scan_items
    assert loaded_item.id == item.id
  end

  test "create_recognized_scan_item_from_capture does not store unmatched captures" do
    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "No match batch"})

    upload_dir =
      Path.join(
        System.tmp_dir!(),
        "manavault-unmatched-captures-#{System.unique_integer([:positive])}"
      )

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

    assert {:error, "No card match found. Keep the card steady in the frame."} =
             Catalog.create_recognized_scan_item_from_capture(
               scan_session,
               "data:image/png;base64,#{Base.encode64("fake image bytes")}",
               ocr_runner: fn _path -> {:ok, "not a card"} end
             )

    assert Catalog.get_scan_session!(scan_session.id).scan_items == []
    assert File.ls!(Path.join(upload_dir, "scan_sessions/#{scan_session.id}")) == []
  end

  test "import_cards populates SQLite OCR search table for normalized and compact text" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert %{rows: [["scryfall-printing-1"]]} =
             Repo.query!(
               """
               SELECT scryfall_id
               FROM scryfall_printing_search
               WHERE scryfall_printing_search MATCH ?
               ORDER BY scryfall_id
               """,
               ["\"blacklotus\""]
             )

    assert %{rows: rows} =
             Repo.query!(
               """
               SELECT scryfall_id
               FROM scryfall_printing_search
               WHERE scryfall_printing_search MATCH ?
               ORDER BY scryfall_id
               """,
               ["\"sacrifice\""]
             )

    assert ["scryfall-printing-1"] in rows
  end

  test "scan recognition uses SQLite search by default for candidate retrieval" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    parsed = ScanRecognition.parse_text("Black Lotus\nSet: LEA\nCollector #232")

    assert [%{printing: printing, confidence: confidence}] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-1"
    assert confidence > 0.0
  end

  test "scan recognition uses SQLite search without an in-memory index option" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    parsed = ScanRecognition.parse_text("Time Walk\nCollector: 84\nSet: LEA")

    assert [%{printing: printing}] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-2"
  end

  test "scan recognition ignores OCR diagnostic lines" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Diagnostic OCR batch"})

    assert {:ok, item} =
             Catalog.create_scan_item(scan_session, %{image_path: "/tmp/black-lotus.jpg"})

    ocr_runner = fn "/tmp/black-lotus.jpg" ->
      {:ok, "Estimating resolution as 231\nBlack Lotus\nSet: LEA\nCollector #232"}
    end

    assert {:ok, recognized_item} = Catalog.recognize_scan_item(item, ocr_runner: ocr_runner)

    assert recognized_item.accepted_printing_id == "scryfall-printing-1"

    refute ScanRecognition.parse_text("Estimating resolution as 231\nBlack Lotus")
           |> Map.fetch!(:tokens)
           |> Enum.member?("estimating")
  end

  test "scan recognition does not treat OCR diagnostics as card text" do
    parsed = ScanRecognition.parse_text("Estimating resolution as 231")

    assert parsed.text == ""
    assert parsed.tokens == []
    assert ScanRecognition.match_candidates(parsed) == []
  end

  test "scan recognition falls back to card names embedded in rules text" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    parsed =
      ScanRecognition.parse_text(
        "{T}, Sacrifice Black Lotus: Add three mana of any one color.\nSet: LEA\nCollector #232"
      )

    assert Enum.any?(parsed.tokens, &(&1 == "black"))
    assert Enum.any?(parsed.tokens, &(&1 == "lotus"))
    assert length(parsed.lines) > 0

    assert [%{printing: printing, confidence: confidence, evidence: evidence}] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-1"
    assert confidence > 0.0

    # Phrase matching: the card name is embedded in the oracle text line
    assert length(evidence.phrase_hits) > 0
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :name))
  end

  test "scan recognition ignores copyright footer lines" do
    parsed = ScanRecognition.parse_text("r 0228 ™ & © 2022 Wizards of the Coast")

    assert parsed.text == ""
    assert parsed.tokens == []
    assert ScanRecognition.match_candidates(parsed) == []
  end

  test "scan recognition ignores artist credit footer lines" do
    parsed = ScanRecognition.parse_text("30a + EN % Christopher Rush")

    assert parsed.text == ""
    assert parsed.tokens == []
    assert ScanRecognition.match_candidates(parsed) == []
  end

  test "scan recognition tokenizes and matches card text regardless of field position" do
    parsed = ScanRecognition.parse_text("Black Lotus\n30a + EN % Christopher Rush")

    assert parsed.text =~ "Black Lotus"
    assert Enum.any?(parsed.tokens, &(&1 == "black"))
    assert Enum.any?(parsed.tokens, &(&1 == "lotus"))
    assert parsed.lines == ["Black Lotus"]
  end

  test "scan recognition falls back to oracle text when name does not parse" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    parsed = ScanRecognition.parse_text("mana of any one color.")

    assert Enum.any?(parsed.tokens, &(&1 == "mana"))

    assert [%{printing: printing, confidence: confidence, evidence: evidence}] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-1"
    assert confidence > 0.0

    # Phrase match: the oracle text fragment should match oracle_text field
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :oracle_text))
  end

  test "scan recognition phrase matching boosts confidence for multi-word matches" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    # OCR with only common single words (no coherent phrases) — low confidence
    parsed_loose = ScanRecognition.parse_text("sacrifice artifact add mana one color")

    case ScanRecognition.match_candidates(parsed_loose) do
      [] ->
        # No candidate found at all with just common words — pass
        :ok

      [%{confidence: loose_conf}] ->
        # If found, confidence should stay below exact-title matches.
        assert loose_conf < 0.6
    end

    # OCR with the actual card name phrase — much higher confidence
    parsed_name = ScanRecognition.parse_text("Black Lotus")

    assert [%{printing: printing, confidence: name_conf, evidence: evidence}] =
             ScanRecognition.match_candidates(parsed_name)

    assert printing.scryfall_id == "scryfall-printing-1"
    assert name_conf > 0.5

    # Phrase hit: "Black Lotus" line matches name
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :name))
  end

  test "recognize_scan_item stores top OCR match on scan item without candidate row writes" do
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
    assert recognized_item.accepted_printing_id == "scryfall-printing-1"
    assert recognized_item.accepted_printing.card.name == "Black Lotus"
  end

  test "recognize_scan_item marks failed OCR as needing review with evidence" do
    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Failed recognition"})
    assert {:ok, item} = Catalog.create_scan_item(scan_session, %{image_path: "/tmp/missing.jpg"})

    assert {:error, "RapidOCR missing", review_item} =
             Catalog.recognize_scan_item(item,
               ocr_runner: fn _path -> {:error, "RapidOCR missing"} end
             )

    assert review_item.status == "needs_review"
    assert review_item.accepted_printing_id == nil
  end

  test "scan recognition parses OCR text and matches candidates without OCR runner" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    parsed = ScanRecognition.parse_text("Time Walk\nCollector: 84\nSet: LEA\nLanguage: ja")

    assert Enum.any?(parsed.tokens, &(&1 == "time"))
    assert Enum.any?(parsed.tokens, &(&1 == "walk"))
    assert parsed.collector_number == "84"
    assert parsed.set_code == "LEA"
    assert parsed.language == "ja"

    assert [%{printing: printing, confidence: confidence, evidence: evidence}] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-2"
    assert confidence > 0.0

    # Phrase match: "Time Walk" line should match the card name
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :name))
  end

  test "scan recognition matches compacted RapidOCR title without spaces" do
    assert {:ok, %{cards_count: 3, printings_count: 3}} =
             Catalog.import_cards([
               @black_lotus,
               %{
                 @black_lotus
                 | "id" => "fellwar-stone-printing",
                   "oracle_id" => "fellwar-stone-oracle",
                   "name" => "Fellwar Stone",
                   "type_line" => "Artifact",
                   "oracle_text" => "Add one mana of any color.",
                   "collector_number" => "228"
               },
               %{
                 @black_lotus
                 | "id" => "arcane-signet-printing",
                   "oracle_id" => "arcane-signet-oracle",
                   "name" => "Arcane Signet",
                   "type_line" => "Artifact",
                   "oracle_text" => "Add one mana of any color.",
                   "collector_number" => "228"
               }
             ])

    parsed =
      ScanRecognition.parse_text("""
      BlackLotus
      Artifact
      EDITION
      30TH
      ,SacrificeBlackLotus:Add three
      mana ofany one color.
      3OA·ENCHRISTOPHERRUSH
      R0228
      &2022Wzs of the Coast
      """)

    assert [%{printing: printing, confidence: confidence, evidence: evidence} | _] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-1"
    assert confidence >= 0.9
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :name and &1.line == "BlackLotus"))
  end

  test "scan recognition keeps exact title and type-line matches ahead of broad token limit" do
    distractors =
      for index <- 1..600 do
        %{
          @black_lotus
          | "id" => "artifact-distractor-#{index}",
            "oracle_id" => "artifact-distractor-oracle-#{index}",
            "name" => "Artifact Distractor #{index}",
            "type_line" => "Artifact",
            "oracle_text" => "Add mana.",
            "collector_number" => "#{index}"
        }
      end

    black_lotus_30a = %{@black_lotus | "collector_number" => "228", "set" => "30a"}

    assert {:ok, %{cards_count: 601, printings_count: 601}} =
             Catalog.import_cards([black_lotus_30a | distractors])

    parsed =
      ScanRecognition.parse_text("""
      Black Lotus
      Artifact
      30T
      EDITION
      ,Sacrifice Black Lotus:Add three
      mana ofany onecolor.
      R0228
      &2022
      """)

    assert [%{printing: printing, confidence: confidence, evidence: evidence} | _] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-1"
    assert confidence >= 0.9
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :name and &1.line == "Black Lotus"))
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :type_line and &1.line == "Artifact"))
  end

  test "scan recognition ranks exact OCR name line above weak token-overlap candidates" do
    lotus_ring = %{
      @black_lotus
      | "id" => "lotus-ring-printing",
        "oracle_id" => "lotus-ring-oracle",
        "name" => "Lotus Ring",
        "oracle_text" => "Whenever one or more creatures attack, draw a card.",
        "collector_number" => "240"
    }

    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, lotus_ring])

    parsed =
      ScanRecognition.parse_text("""
      Black Lotus
      Artifact
      EDMON
      Sacrifice Black Lotus: Add three
      mana of any one color:
      301h
      """)

    assert [%{printing: printing, evidence: evidence} | _] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-1"
    assert evidence.scores.phrase_match >= 0.55
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :name and &1.line == "Black Lotus"))
  end

  test "scan recognition includes exact name lines outside first broad token window" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])

    parsed =
      ScanRecognition.parse_text("""
      one two three four five six seven eight
      Black Lotus
      """)

    assert parsed.tokens == [
             "one",
             "two",
             "three",
             "four",
             "five",
             "six",
             "seven",
             "eight",
             "black",
             "lotus"
           ]

    assert [%{printing: printing, evidence: evidence}] = ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-1"
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :name and &1.line == "Black Lotus"))
  end

  test "scan recognition does not boost blank card text as phrase match" do
    blank_text_card = %{
      @black_lotus
      | "id" => "blank-text-printing",
        "oracle_id" => "blank-text-oracle",
        "name" => "Gilded Sentinel",
        "type_line" => nil,
        "oracle_text" => nil,
        "collector_number" => "239"
    }

    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, blank_text_card])

    parsed =
      ScanRecognition.parse_text("""
      Black Lotus
      Artifact
      Sacrifice Black Lotus: Add three
      mana
      of any one color:
      """)

    assert [%{printing: printing, evidence: evidence} | _] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-1"
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :type_line and &1.line == "Artifact"))
  end

  test "scan recognition handles integer scoring values without crashing debug logging" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    parsed = ScanRecognition.parse_text("Black")

    assert [%{confidence: confidence, evidence: %{scores: scores}}] =
             ScanRecognition.match_candidates(parsed)

    assert is_float(confidence)
    assert is_integer(scores.phrase_match)
  end

  test "scan recognition does not treat single-word names in non-title text as title evidence" do
    cat = %{
      @black_lotus
      | "id" => "cat-printing",
        "oracle_id" => "cat-oracle",
        "name" => "Cat",
        "type_line" => "Creature — Cat",
        "oracle_text" => "Vigilance.",
        "collector_number" => "241"
    }

    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, cat])

    parsed =
      ScanRecognition.parse_text("""
      Black Lotus
      Artifact
      Create a 1/1 white Cat creature token.
      Sacrifice Black Lotus: Add three mana of any one color.
      """)

    assert [lotus, cat_candidate | _] = ScanRecognition.match_candidates(parsed)

    assert lotus.printing.scryfall_id == "scryfall-printing-1"
    assert cat_candidate.printing.scryfall_id == "cat-printing"
    refute Enum.any?(cat_candidate.evidence.phrase_hits, &(&1.field == :name))
  end

  test "scan recognition tie-breaks confidence ties toward exact title and type evidence" do
    exact_card = %{
      @black_lotus
      | "id" => "zz-exact-printing",
        "oracle_id" => "zz-exact-oracle",
        "name" => "Alpha Beta",
        "type_line" => "Creature — Cat",
        "oracle_text" => "Alpha beta gamma delta epsilon zeta eta theta.",
        "collector_number" => "242"
    }

    broad_card = %{
      @black_lotus
      | "id" => "aa-broad-printing",
        "oracle_id" => "aa-broad-oracle",
        "name" => "Gamma Delta",
        "type_line" => "Instant",
        "oracle_text" => "Alpha Beta Creature Cat gamma delta epsilon zeta eta theta.",
        "collector_number" => "243"
    }

    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([broad_card, exact_card])

    parsed =
      ScanRecognition.parse_text("""
      Alpha Beta
      Creature — Cat
      gamma delta epsilon zeta eta theta
      """)

    assert [%{printing: printing, confidence: 1.0, evidence: evidence}, %{confidence: 1.0} | _] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "zz-exact-printing"
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :name and &1.line == "Alpha Beta"))

    assert Enum.any?(
             evidence.phrase_hits,
             &(&1.field == :type_line and &1.line == "Creature — Cat")
           )
  end

  test "scan recognition handles RapidOCR output with card name, oracle text, and footer" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    # Simulate RapidOCR output: card name as first line, type line, oracle text, footer
    parsed =
      ScanRecognition.parse_text("""
      Black Lotus
      Artifact
      301h
      EDITION
      Sacrifice Black Lotus: Add three
      mana of any one color:
      R 0228
      Ta02022uuad othc Cout
      J0a * EN
      ~CHRISTOPHtr Rush
      """)

    # Card name tokens are present
    assert Enum.any?(parsed.tokens, &(&1 == "black"))
    assert Enum.any?(parsed.tokens, &(&1 == "lotus"))

    # "Black Lotus" is a clean line for phrase matching
    assert Enum.any?(parsed.lines, &String.contains?(&1, "Black Lotus"))

    # Footer garbage and artist credit lines are present in tokens
    # but are harmless — they don't match any card field, just proportionally
    # drag down scores for all candidates equally.
    assert length(parsed.tokens) > 8

    # Collector number extracted from footer
    assert parsed.collector_number == "0228"

    # Black Lotus is the top match with high confidence
    assert [%{printing: printing, confidence: confidence, evidence: evidence}] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-1"
    assert confidence > 0.7

    # Phrase match: "Black Lotus" line hits the card name
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :name))
  end

  test "accept_scan_item creates collection inventory from stored printing and marks item accepted" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, binder} = Catalog.create_location(%{name: "Review Binder", kind: "binder"})
    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Review accept"})

    assert {:ok, item} =
             Catalog.create_scan_item(scan_session, %{
               status: "recognized",
               accepted_printing_id: "scryfall-printing-1",
               quantity: 3,
               condition: "lightly_played",
               language: "en",
               finish: "nonfoil",
               location_id: binder.id
             })

    assert {:ok, %{scan_item: accepted_item, collection_item: collection_item}} =
             Catalog.accept_scan_item(item.id)

    assert accepted_item.status == "accepted"
    assert accepted_item.accepted_printing_id == "scryfall-printing-1"
    assert collection_item.scryfall_id == "scryfall-printing-1"
    assert collection_item.quantity == 3
    assert collection_item.condition == "lightly_played"
    assert collection_item.location_id == binder.id

    assert {:error, :already_accepted} = Catalog.accept_scan_item(item.id)
  end

  test "undo_scan_item_accept reverts accepted item and removes matching collection row" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])
    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Undo accept"})

    assert {:ok, item} =
             Catalog.create_scan_item(scan_session, %{
               status: "recognized",
               accepted_printing_id: "scryfall-printing-1"
             })

    assert {:ok, %{scan_item: accepted_item}} = Catalog.accept_scan_item(item.id)
    assert accepted_item.status == "accepted"
    assert [_collection_item] = Catalog.list_collection_items()

    assert {:ok, reverted_item} = Catalog.undo_scan_item_accept(item.id)

    assert reverted_item.status == "recognized"
    assert reverted_item.accepted_printing_id == "scryfall-printing-1"
    assert [] = Catalog.list_collection_items()

    assert {:error, :not_accepted} = Catalog.undo_scan_item_accept(item.id)
  end

  test "set_scan_item_printing stores manual exact printing and can accept it" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Manual correction"})

    assert {:ok, item} =
             Catalog.create_scan_item(scan_session, %{
               status: "needs_review",
               finish: "foil",
               language: "ja"
             })

    assert {:ok, corrected_item} = Catalog.set_scan_item_printing(item.id, "scryfall-printing-2")

    assert corrected_item.status == "recognized"
    assert corrected_item.accepted_printing_id == "scryfall-printing-2"

    assert {:ok, %{scan_item: accepted_item, collection_item: collection_item}} =
             Catalog.accept_scan_item(item.id)

    assert accepted_item.status == "accepted"
    assert collection_item.scryfall_id == "scryfall-printing-2"
  end

  test "update_scan_item_review and reject_scan_item support review corrections" do
    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Review fields"})
    assert {:ok, binder} = Catalog.create_location(%{name: "Reject Binder", kind: "binder"})
    assert {:ok, item} = Catalog.create_scan_item(scan_session, %{status: "needs_review"})

    assert {:ok, updated_item} =
             item
             |> Catalog.update_scan_item_review(%{
               "quantity" => "2",
               "condition" => "moderately_played",
               "language" => "ja",
               "finish" => "foil",
               "location_id" => "#{binder.id}"
             })

    assert updated_item.quantity == 2
    assert updated_item.condition == "moderately_played"
    assert updated_item.language == "ja"
    assert updated_item.finish == "foil"
    assert updated_item.location_id == binder.id

    assert {:ok, rejected_item} = Catalog.reject_scan_item(updated_item.id)
    assert rejected_item.status == "rejected"
    assert [] = Catalog.list_collection_items()
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
