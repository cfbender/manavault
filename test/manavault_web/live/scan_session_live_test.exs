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

  test "creates a scan session with generated name and defaults", %{conn: conn} do
    {:ok, binder} = Catalog.create_location(%{name: "Scan Binder", kind: "binder"})

    {:ok, view, html} = live(conn, ~p"/scan-sessions")

    assert html =~ "Scan sessions"
    assert html =~ "New scan session"
    assert html =~ "No scan sessions yet."
    assert html =~ "Scan Binder"

    view
    |> form("#scan-session-form",
      scan_session: %{
        default_condition: "lightly_played",
        default_language: "ja",
        default_finish: "foil",
        default_location_id: binder.id
      }
    )
    |> render_submit()

    [scan_session] = Catalog.list_scan_sessions()
    assert scan_session.name == generated_date_name()
    assert scan_session.default_condition == "lightly_played"
    assert scan_session.default_language == "ja"
    assert scan_session.default_finish == "foil"
    assert scan_session.default_location_id == binder.id

    assert_redirected(view, ~p"/scan-sessions/#{scan_session.id}")
  end

  test "scan entry starts a scanner when there are no sessions", %{conn: conn} do
    conn = get(conn, ~p"/scan")

    [scan_session] = Catalog.list_scan_sessions()
    assert scan_session.name == generated_date_name()
    assert redirected_to(conn) == ~p"/scan-sessions/#{scan_session.id}/scanner"
  end

  test "generated scan session names use the next date suffix", %{conn: conn} do
    base_name = generated_date_name()

    {:ok, _first} = Catalog.create_scan_session(%{"name" => base_name})
    {:ok, _second} = Catalog.create_scan_session(%{"name" => "#{base_name} (2)"})

    {:ok, view, _html} = live(conn, ~p"/scan-sessions")

    view
    |> form("#scan-session-form",
      scan_session: %{
        default_condition: "near_mint",
        default_language: "en",
        default_finish: "nonfoil",
        default_location_id: ""
      }
    )
    |> render_submit()

    assert Enum.any?(Catalog.list_scan_sessions(), &(&1.name == "#{base_name} (3)"))
  end

  test "scan entry opens the sessions list when sessions already exist", %{conn: conn} do
    {:ok, _scan_session} = Catalog.create_scan_session(%{"name" => "Existing batch"})

    conn = get(conn, ~p"/scan")

    assert redirected_to(conn) == ~p"/scan-sessions"
  end

  test "opens the scanner from scan session detail", %{conn: conn} do
    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Camera batch"})

    {:ok, _view, html} = live(conn, ~p"/scan-sessions/#{scan_session.id}")

    assert html =~ "Scan"
    assert html =~ "Delete"
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

    assert html =~ "Scan cards"
    assert html =~ "Review batch"
    assert html =~ "Discard session"
    assert html =~ "Switch camera"
    assert html =~ "Flashlight"
    assert html =~ ~s|phx-hook="ScannerCamera"|
    refute html =~ "Start camera"
    refute html =~ "Capture card"
    refute html =~ "Stop"
    refute html =~ "Align card inside frame"

    image_data = "data:image/png;base64,#{Base.encode64("Black Lotus\nSet: LEA\nCollector #232")}"
    html = render_hook(view, "capture", %{"image_data" => image_data})

    assert html =~ "Recognized card"
    assert html =~ "Scanned cards"
    assert html =~ "Black Lotus"
    assert html =~ "LEA"
    assert html =~ "$100k"

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

    refute html =~ "No card was added."
    refute html =~ "No card match found. Keep the card steady in the frame."
    assert Catalog.get_scan_session!(scan_session.id).scan_items == []
  end

  test "scanner options can prefer foil and lock captures to selected sets", %{conn: conn} do
    assert {:ok, _sync} =
             Catalog.import_cards([
               %{
                 @black_lotus
                 | "id" => "scryfall-printing-3",
                   "set" => "leb",
                   "set_name" => "Limited Edition Beta",
                   "collector_number" => "233",
                   "finishes" => ["nonfoil", "foil"],
                   "released_at" => "1993-10-04"
               }
             ])

    previous_runner = Application.get_env(:manavault, :ocr_runner)

    Application.put_env(:manavault, :ocr_runner, fn _path ->
      {:ok, "Black Lotus"}
    end)

    on_exit(fn ->
      if previous_runner do
        Application.put_env(:manavault, :ocr_runner, previous_runner)
      else
        Application.delete_env(:manavault, :ocr_runner)
      end
    end)

    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Option scanner"})
    {:ok, view, html} = live(conn, ~p"/scan-sessions/#{scan_session.id}/scanner")

    assert html =~ "Scanner options"

    html = render_click(view, "open_scanner_options")
    assert html =~ "Prefer foil"
    assert html =~ "Lock to sets"

    view
    |> form("#scanner-prefer-foil-form", prefer_foil: "true")
    |> render_change()

    html =
      view
      |> form("#scanner-set-search-form", set_search: %{q: "beta"})
      |> render_submit()

    assert html =~ "Limited Edition Beta"

    html =
      render_click(view, "add_locked_set", %{
        "code" => "leb",
        "name" => "Limited Edition Beta"
      })

    assert html =~ "LEB"

    image_data = "data:image/png;base64,#{Base.encode64("Black Lotus")}"
    assert render_hook(view, "capture", %{"image_data" => image_data}) =~ "Recognized card"

    assert [%{accepted_printing_id: "scryfall-printing-3", finish: "foil"}] =
             Catalog.get_scan_session!(scan_session.id).scan_items
  end

  test "scanner can rescan the same card after deleting it", %{conn: conn} do
    previous_runner = Application.get_env(:manavault, :ocr_runner)

    Application.put_env(:manavault, :ocr_runner, fn _path ->
      {:ok, "Black Lotus\nSet: LEA\nCollector #232"}
    end)

    on_exit(fn ->
      if previous_runner do
        Application.put_env(:manavault, :ocr_runner, previous_runner)
      else
        Application.delete_env(:manavault, :ocr_runner)
      end
    end)

    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Rescan after delete"})

    {:ok, item} =
      Catalog.create_scan_item(scan_session, %{
        status: "recognized",
        accepted_printing_id: "scryfall-printing-1",
        image_path: "/tmp/deleted-card.jpg"
      })

    {:ok, view, _html} = live(conn, ~p"/scan-sessions/#{scan_session.id}/scanner")

    render_click(view, "delete_scan_item", %{"id" => item.id})

    assert Catalog.get_scan_session!(scan_session.id).scan_items == []

    image_data = "data:image/png;base64,#{Base.encode64("Black Lotus")}"

    assert render_hook(view, "capture", %{"image_data" => image_data}) =~ "Recognized card"

    assert [%{accepted_printing_id: "scryfall-printing-1"}] =
             Catalog.get_scan_session!(scan_session.id).scan_items
  end

  test "scanner page shows scanned cards with quick controls", %{conn: conn} do
    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Batch scanner"})

    {:ok, item} =
      Catalog.create_scan_item(scan_session, %{
        status: "recognized",
        accepted_printing_id: "scryfall-printing-1",
        image_path: "/tmp/batch.jpg"
      })

    {:ok, _view, html} = live(conn, ~p"/scan-sessions/#{scan_session.id}/scanner")

    assert html =~ "Scanned cards"
    assert html =~ "Black Lotus"
    assert html =~ "LEA"
    assert html =~ "$100k"
    assert html =~ "Toggle foil"
    assert html =~ "Decrease quantity"
    assert html =~ "Edit scanned card"
    assert html =~ ~s|phx-value-id="#{item.id}"|
    refute html =~ "Accept best"
    refute html =~ "Undo accept"
    refute html =~ "Recent scans"
  end

  test "scanner quick controls update scanned cards", %{conn: conn} do
    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Fast fixes"})

    {:ok, item} =
      Catalog.create_scan_item(scan_session, %{
        status: "recognized",
        accepted_printing_id: "scryfall-printing-1",
        quantity: 1,
        finish: "nonfoil",
        image_path: "/tmp/fast.jpg"
      })

    {:ok, view, _html} = live(conn, ~p"/scan-sessions/#{scan_session.id}/scanner")

    render_click(view, "adjust_scan_item_quantity", %{"id" => item.id, "delta" => "1"})
    assert Catalog.get_scan_item!(item.id).quantity == 2

    render_click(view, "adjust_scan_item_quantity", %{"id" => item.id, "delta" => "-1"})
    assert Catalog.get_scan_item!(item.id).quantity == 1

    render_click(view, "adjust_scan_item_quantity", %{"id" => item.id, "delta" => "-1"})
    assert Catalog.get_scan_item!(item.id).quantity == 1

    render_click(view, "toggle_scan_item_foil", %{"id" => item.id})
    assert Catalog.get_scan_item!(item.id).finish == "foil"

    render_click(view, "toggle_scan_item_foil", %{"id" => item.id})
    assert Catalog.get_scan_item!(item.id).finish == "nonfoil"
  end

  test "scanner edit modal can edit and change printing", %{conn: conn} do
    assert {:ok, %{cards_count: 1, printings_count: 1}} =
             Catalog.import_cards([
               %{
                 @black_lotus
                 | "id" => "scryfall-printing-3",
                   "set" => "leb",
                   "set_name" => "Limited Edition Beta",
                   "collector_number" => "233",
                   "prices" => %{"usd" => "95000.00"},
                   "released_at" => "1993-10-04"
               }
             ])

    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Scanner fixes"})

    {:ok, item} =
      Catalog.create_scan_item(scan_session, %{
        status: "recognized",
        accepted_printing_id: "scryfall-printing-1",
        quantity: 1,
        image_path: "/tmp/scanner-fix.jpg"
      })

    {:ok, view, _html} = live(conn, ~p"/scan-sessions/#{scan_session.id}/scanner")

    assert render_click(view, "edit_scan_item", %{"id" => item.id}) =~ "Edit scanned card"

    html =
      view
      |> form("#scanner-scan-item-edit-form",
        _id: item.id,
        scan_item: %{
          quantity: "2",
          condition: "heavily_played",
          language: "ja",
          finish: "foil"
        }
      )
      |> render_submit()

    assert html =~ "Updated scan item ##{item.id}."
    edited = Catalog.get_scan_item!(item.id)
    assert edited.quantity == 2
    assert edited.condition == "heavily_played"
    assert edited.language == "ja"
    assert edited.finish == "foil"

    html = render_click(view, "change_scan_printing", %{"id" => item.id})
    assert html =~ "Change card"
    assert html =~ ~s|value="Black Lotus"|
    assert html =~ "LEA"
    assert html =~ "LEB"

    html =
      view
      |> form("#scanner-printing-search-form", search: %{q: "Time Walk"})
      |> render_submit()

    assert html =~ "Time Walk"

    render_click(view, "select_printing", %{
      "id" => item.id,
      "scryfall_id" => "scryfall-printing-2"
    })

    assert Catalog.get_scan_item!(item.id).accepted_printing_id == "scryfall-printing-2"
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

    assert html =~ "Cards"
    refute html =~ ~s|id="scan-items-count"|
    refute html =~ ~s|id="recognized-count"|
    refute html =~ ~s|id="unmatched-count"|
    assert html =~ "Move cards"
    assert html =~ "Black Lotus"
    assert html =~ "Edit"
    assert html =~ "Change printing"
    assert html =~ "Delete"
    refute html =~ "Pending items"
    refute html =~ "Reviewed items"
    refute html =~ "Accepted items"
    refute html =~ "Accept best"
    refute html =~ "Exact printing correction"

    result =
      view
      |> form("#scan-session-bulk-move-form", bulk: %{location_id: "#{binder.id}"})
      |> render_submit()

    assert {:error, {:live_redirect, %{to: to}}} = result
    assert to == ~p"/collection/locations/#{binder.id}"

    [collection_item] = Catalog.list_collection_items()
    assert collection_item.scryfall_id == "scryfall-printing-1"
    assert collection_item.quantity == 2
    assert collection_item.condition == "lightly_played"
    assert collection_item.location_id == binder.id

    assert_raise Ecto.NoResultsError, fn -> Catalog.get_scan_session!(scan_session.id) end
    assert_raise Ecto.NoResultsError, fn -> Catalog.get_scan_item!(recognized.id) end
  end

  test "session page bulk move without a location returns to unfiled collection", %{conn: conn} do
    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Move unfiled"})

    {:ok, _recognized} =
      Catalog.create_scan_item(scan_session, %{
        status: "recognized",
        accepted_printing_id: "scryfall-printing-1",
        quantity: 1,
        image_path: "/tmp/unfiled.jpg"
      })

    {:ok, view, _html} = live(conn, ~p"/scan-sessions/#{scan_session.id}")

    result =
      view
      |> form("#scan-session-bulk-move-form", bulk: %{location_id: ""})
      |> render_submit()

    assert {:error, {:live_redirect, %{to: to}}} = result
    assert to == ~p"/collection?location_id=unfiled"

    [collection_item] = Catalog.list_collection_items()
    assert collection_item.location_id == nil
    assert_raise Ecto.NoResultsError, fn -> Catalog.get_scan_session!(scan_session.id) end
  end

  test "session card menu edits changes card and deletes scanned cards", %{conn: conn} do
    assert {:ok, %{cards_count: 1, printings_count: 1}} =
             Catalog.import_cards([
               %{
                 @black_lotus
                 | "id" => "scryfall-printing-3",
                   "set" => "leb",
                   "set_name" => "Limited Edition Beta",
                   "collector_number" => "233",
                   "prices" => %{"usd" => "95000.00"},
                   "released_at" => "1993-10-04"
               }
             ])

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

    html =
      render_click(view, "change_scan_printing", %{"id" => item.id})

    assert html =~ "Change card"
    assert html =~ ~s(value="Black Lotus")
    assert html =~ "LEA"
    assert html =~ "LEB"
    assert html =~ "Current"

    html =
      view
      |> form("#scan-session-printing-search-form", search: %{q: "Time Walk"})
      |> render_submit()

    assert html =~ "Time Walk"

    html =
      render_click(view, "select_printing", %{
        "id" => item.id,
        "scryfall_id" => "scryfall-printing-2"
      })

    assert html =~ "Changed scan item printing."
    assert Catalog.get_scan_item!(item.id).accepted_printing_id == "scryfall-printing-2"

    html = render_click(view, "delete_scan_item", %{"id" => item.id})

    assert html =~ "Deleted scan item ##{item.id}."
    assert_raise Ecto.NoResultsError, fn -> Catalog.get_scan_item!(item.id) end
  end

  test "session can be discarded with its scanned cards", %{conn: conn} do
    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Discard me"})

    {:ok, item} =
      Catalog.create_scan_item(scan_session, %{
        status: "recognized",
        accepted_printing_id: "scryfall-printing-1"
      })

    {:ok, view, _html} = live(conn, ~p"/scan-sessions/#{scan_session.id}")

    {:error, {:live_redirect, %{to: "/scan-sessions"}}} =
      render_click(view, "delete_scan_session", %{})

    assert_raise Ecto.NoResultsError, fn -> Catalog.get_scan_session!(scan_session.id) end
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
    assert html =~ "$100k"
    refute html =~ "Candidates ("
  end

  defp generated_date_name do
    DateTime.utc_now()
    |> Calendar.strftime("%m/%d/%Y")
  end
end
