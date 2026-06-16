defmodule ManavaultWeb.ScanSessionLiveTest do
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
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    :ok
  end

  test "creates a scan session with defaults", %{conn: conn} do
    {:ok, binder} = Catalog.create_location(%{name: "Scan Binder", kind: "binder"})

    {:ok, view, html} = live(conn, ~p"/scan-sessions")

    assert html =~ "Scan sessions"
    assert html =~ "New scan session"
    assert html =~ "No scan sessions yet."
    assert html =~ "Scan Binder"

    view
    |> form("#scan-session-form",
      scan_session: %{
        name: "Saturday inbox",
        default_condition: "lightly_played",
        default_language: "ja",
        default_finish: "foil",
        default_location_id: binder.id
      }
    )
    |> render_submit()

    [scan_session] = Catalog.list_scan_sessions()
    assert scan_session.name == "Saturday inbox"
    assert scan_session.default_condition == "lightly_played"
    assert scan_session.default_language == "ja"
    assert scan_session.default_finish == "foil"
    assert scan_session.default_location_id == binder.id

    assert_redirected(view, ~p"/scan-sessions/#{scan_session.id}")
  end

  test "opens the mobile scanner from scan session detail", %{conn: conn} do
    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Camera batch"})

    {:ok, _view, html} = live(conn, ~p"/scan-sessions/#{scan_session.id}")

    assert html =~ "Open scanner"
    assert html =~ ~p"/scan-sessions/#{scan_session.id}/scanner"
  end

  test "scanner page auto-renders camera controls and stores recognized captures", %{conn: conn} do
    upload_dir =
      Path.join(
        System.tmp_dir!(),
        "manavault-live-captures-#{System.unique_integer([:positive])}"
      )

    previous_dir = Application.get_env(:manavault, :capture_upload_dir)
    previous_runner = Application.get_env(:manavault, :ocr_runner)
    previous_async = Application.get_env(:manavault, :scan_recognition_async)
    Application.put_env(:manavault, :capture_upload_dir, upload_dir)

    Application.put_env(:manavault, :ocr_runner, fn path -> {:ok, File.read!(path)} end)

    Application.put_env(:manavault, :scan_recognition_async, false)

    on_exit(fn ->
      if previous_dir do
        Application.put_env(:manavault, :capture_upload_dir, previous_dir)
      else
        Application.delete_env(:manavault, :capture_upload_dir)
      end

      if previous_runner do
        Application.put_env(:manavault, :ocr_runner, previous_runner)
      else
        Application.delete_env(:manavault, :ocr_runner)
      end

      if is_nil(previous_async) do
        Application.delete_env(:manavault, :scan_recognition_async)
      else
        Application.put_env(:manavault, :scan_recognition_async, previous_async)
      end

      File.rm_rf!(upload_dir)
    end)

    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Pocket scans"})

    {:ok, view, html} = live(conn, ~p"/scan-sessions/#{scan_session.id}/scanner")

    assert html =~ "Mobile scanner"
    assert html =~ "Switch camera"
    assert html =~ "Flashlight"
    assert html =~ "pink frame"
    assert html =~ ~s|phx-hook="ScannerCamera"|
    refute html =~ "Start camera"
    refute html =~ "Capture card"
    refute html =~ "Stop"
    refute html =~ "Align card inside frame"

    image_data = "data:image/png;base64,#{Base.encode64("Black Lotus\nSet: LEA\nCollector #232")}"
    html = render_hook(view, "capture", %{"image_data" => image_data})

    assert html =~ "Recognized card"
    assert html =~ "Session cards"
    assert html =~ "Black Lotus"
    assert html =~ "LEA"
    assert html =~ "$100000"

    loaded = Catalog.get_scan_session!(scan_session.id)
    assert [item] = loaded.scan_items
    assert item.status == "recognized"
    assert item.image_path =~ upload_dir
    assert File.read!(item.image_path) == "Black Lotus\nSet: LEA\nCollector #232"
    assert item.accepted_printing_id == "scryfall-printing-1"
  end

  test "scanner suppresses back to back same card unless forced", %{conn: conn} do
    upload_dir =
      Path.join(
        System.tmp_dir!(),
        "manavault-duplicate-captures-#{System.unique_integer([:positive])}"
      )

    previous_dir = Application.get_env(:manavault, :capture_upload_dir)
    previous_runner = Application.get_env(:manavault, :ocr_runner)
    Application.put_env(:manavault, :capture_upload_dir, upload_dir)

    {:ok, ocr_sequence} =
      Agent.start_link(fn ->
        [
          "Black Lotus\nSet: LEA\nCollector #232",
          "Black Lotus\nSet: LEA\nCollector #232",
          "Time Walk\nSet: LEA\nCollector #84",
          "Time Walk\nSet: LEA\nCollector #84",
          "Time Walk\nSet: LEA\nCollector #84"
        ]
      end)

    Application.put_env(:manavault, :ocr_runner, fn _path ->
      {:ok, Agent.get_and_update(ocr_sequence, fn [text | rest] -> {text, rest} end)}
    end)

    on_exit(fn ->
      if previous_dir do
        Application.put_env(:manavault, :capture_upload_dir, previous_dir)
      else
        Application.delete_env(:manavault, :capture_upload_dir)
      end

      if previous_runner do
        Application.put_env(:manavault, :ocr_runner, previous_runner)
      else
        Application.delete_env(:manavault, :ocr_runner)
      end

      File.rm_rf!(upload_dir)
    end)

    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Duplicate scanner"})
    {:ok, view, _html} = live(conn, ~p"/scan-sessions/#{scan_session.id}/scanner")

    black_lotus_image = "data:image/png;base64,#{Base.encode64("Black Lotus")}"
    time_walk_image = "data:image/png;base64,#{Base.encode64("Time Walk")}"

    assert render_hook(view, "capture", %{"image_data" => black_lotus_image}) =~
             "Recognized card"

    assert [_item] = Catalog.get_scan_session!(scan_session.id).scan_items

    html = render_hook(view, "capture", %{"image_data" => black_lotus_image})

    assert html =~ "Same card still in frame. Tap the preview to scan it again."
    assert [_item] = Catalog.get_scan_session!(scan_session.id).scan_items

    assert render_hook(view, "capture", %{"image_data" => time_walk_image}) =~
             "Recognized card"

    [first, second] =
      scan_session.id
      |> Catalog.get_scan_session!()
      |> Map.fetch!(:scan_items)
      |> Enum.sort_by(& &1.id)

    assert first.accepted_printing_id == "scryfall-printing-1"
    assert second.accepted_printing_id == "scryfall-printing-2"

    assert render_hook(view, "capture", %{"image_data" => time_walk_image}) =~
             "Same card still in frame. Tap the preview to scan it again."

    assert [_first, _second] =
             scan_session.id
             |> Catalog.get_scan_session!()
             |> Map.fetch!(:scan_items)
             |> Enum.sort_by(& &1.id)

    assert render_hook(view, "capture", %{"image_data" => time_walk_image, "force" => true}) =~
             "Recognized card"

    assert [_first, _second, _forced] =
             scan_session.id
             |> Catalog.get_scan_session!()
             |> Map.fetch!(:scan_items)
             |> Enum.sort_by(& &1.id)
  end

  test "scanner page does not add a scan card when OCR has no match", %{conn: conn} do
    previous_runner = Application.get_env(:manavault, :ocr_runner)

    Application.put_env(:manavault, :ocr_runner, fn _path -> {:ok, "not a matching card"} end)

    on_exit(fn ->
      if previous_runner do
        Application.put_env(:manavault, :ocr_runner, previous_runner)
      else
        Application.delete_env(:manavault, :ocr_runner)
      end
    end)

    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "No match scanner"})
    {:ok, view, _html} = live(conn, ~p"/scan-sessions/#{scan_session.id}/scanner")

    image_data = "data:image/png;base64,#{Base.encode64("unmatched bytes")}"
    html = render_hook(view, "capture", %{"image_data" => image_data})

    assert html =~ "No card was added."
    assert html =~ "No card match found. Keep the card steady in the frame."
    assert Catalog.get_scan_session!(scan_session.id).scan_items == []
  end

  test "scanner page shows session cards without manual review controls", %{conn: conn} do
    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Batch scanner"})

    {:ok, _item} =
      Catalog.create_scan_item(scan_session, %{
        status: "recognized",
        accepted_printing_id: "scryfall-printing-1",
        image_path: "/tmp/batch.jpg"
      })

    {:ok, _view, html} = live(conn, ~p"/scan-sessions/#{scan_session.id}/scanner")

    assert html =~ "Session cards"
    assert html =~ "Black Lotus"
    assert html =~ "LEA"
    assert html =~ "$100000"
    refute html =~ "Accept best"
    refute html =~ "Undo accept"
    refute html =~ "Recent scans"
  end

  test "scanner page reports camera errors", %{conn: conn} do
    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Unsupported camera"})

    {:ok, view, _html} = live(conn, ~p"/scan-sessions/#{scan_session.id}/scanner")

    html = render_hook(view, "camera_error", %{"message" => "Camera permission was denied."})

    assert html =~ "Camera permission was denied."
  end

  test "session page bulk moves recognized cards once and reports skipped cards", %{conn: conn} do
    {:ok, binder} = Catalog.create_location(%{name: "Session Binder", kind: "binder"})
    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Move batch"})

    {:ok, recognized} =
      Catalog.create_scan_item(scan_session, %{
        status: "recognized",
        accepted_printing_id: "scryfall-printing-1",
        quantity: 2,
        condition: "lightly_played",
        image_path: "/tmp/recognized.jpg"
      })

    {:ok, _unmatched} = Catalog.create_scan_item(scan_session, %{status: "needs_review"})

    {:ok, view, html} = live(conn, ~p"/scan-sessions/#{scan_session.id}")

    assert html =~ "Session cards"
    assert html =~ ~s|id="scan-items-count"|
    assert html =~ ~s|id="recognized-count"|
    assert html =~ ~s|id="unmatched-count"|
    assert html =~ "Move session cards"
    assert html =~ "Black Lotus"
    assert html =~ "Edit"
    assert html =~ "Change printing"
    assert html =~ "Delete"
    refute html =~ "Pending items"
    refute html =~ "Reviewed items"
    refute html =~ "Accepted items"
    refute html =~ "Accept best"
    refute html =~ "Exact printing correction"

    html =
      view
      |> form("#scan-session-bulk-move-form", bulk: %{location_id: "#{binder.id}"})
      |> render_submit()

    assert html =~ "Moved 1 session cards. Skipped 1 unmatched or already-moved cards."

    [collection_item] = Catalog.list_collection_items()
    assert collection_item.scryfall_id == "scryfall-printing-1"
    assert collection_item.quantity == 2
    assert collection_item.condition == "lightly_played"
    assert collection_item.location_id == binder.id

    assert Catalog.get_scan_item!(recognized.id).status == "accepted"

    html =
      view
      |> form("#scan-session-bulk-move-form", bulk: %{location_id: "#{binder.id}"})
      |> render_submit()

    assert html =~ "Moved 0 session cards. Skipped 2 unmatched or already-moved cards."
    assert [_collection_item] = Catalog.list_collection_items()
  end

  test "session card menu edits changes printing and deletes scanned cards", %{conn: conn} do
    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Fix before move"})

    {:ok, item} =
      Catalog.create_scan_item(scan_session, %{
        status: "recognized",
        accepted_printing_id: "scryfall-printing-1",
        quantity: 1,
        image_path: "/tmp/fix.jpg"
      })

    {:ok, view, _html} = live(conn, ~p"/scan-sessions/#{scan_session.id}")

    assert render_click(view, "edit_scan_item", %{"id" => item.id}) =~ "Edit scanned card"

    html =
      view
      |> form("#scan-item-edit-form",
        _id: item.id,
        scan_item: %{
          quantity: "3",
          condition: "moderately_played",
          language: "ja",
          finish: "nonfoil"
        }
      )
      |> render_submit()

    assert html =~ "Updated scan item ##{item.id}."
    edited = Catalog.get_scan_item!(item.id)
    assert edited.quantity == 3
    assert edited.condition == "moderately_played"
    assert edited.language == "ja"

    assert render_click(view, "change_scan_printing", %{"id" => item.id}) =~ "Change printing"

    html =
      view
      |> form("#scan-printing-search-form",
        printing_search: %{name: "Time Walk", set_code: "lea", collector_number: "84"}
      )
      |> render_submit()

    assert html =~ "Time Walk · LEA #84"

    html =
      render_click(view, "select_printing", %{
        "id" => item.id,
        "scryfall-id" => "scryfall-printing-2"
      })

    assert html =~ "Changed scan item printing."
    assert Catalog.get_scan_item!(item.id).accepted_printing_id == "scryfall-printing-2"

    html = render_click(view, "delete_scan_item", %{"id" => item.id})

    assert html =~ "Deleted scan item ##{item.id}."
    assert_raise Ecto.NoResultsError, fn -> Catalog.get_scan_item!(item.id) end
  end

  test "session page renders all scanned cards with shared card tiles", %{conn: conn} do
    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Session overview"})

    {:ok, pending} =
      Catalog.create_scan_item(scan_session, %{
        status: "pending",
        image_path: "/tmp/pending.jpg"
      })

    {:ok, recognized} =
      Catalog.create_scan_item(scan_session, %{
        status: "recognized",
        accepted_printing_id: "scryfall-printing-1",
        image_path: "/tmp/recognized.jpg"
      })

    {:ok, _view, html} = live(conn, ~p"/scan-sessions/#{scan_session.id}")

    assert html =~ "Session overview"
    assert html =~ ~s|id="scan-session-card-grid"|
    assert html =~ ~s|id="scan-item-#{pending.id}"|
    assert html =~ ~s|id="scan-item-#{recognized.id}"|
    assert html =~ "Scan item ##{pending.id}"
    assert html =~ "Black Lotus"
    assert html =~ "LEA"
    assert html =~ "$100000"
    refute html =~ "Candidates ("
  end
end
