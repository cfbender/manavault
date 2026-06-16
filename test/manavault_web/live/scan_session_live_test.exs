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

  test "scanner page renders camera controls and stores captured stills", %{conn: conn} do
    upload_dir =
      Path.join(
        System.tmp_dir!(),
        "manavault-live-captures-#{System.unique_integer([:positive])}"
      )

    previous_dir = Application.get_env(:manavault, :capture_upload_dir)
    previous_runner = Application.get_env(:manavault, :ocr_runner)
    previous_async = Application.get_env(:manavault, :scan_recognition_async)
    Application.put_env(:manavault, :capture_upload_dir, upload_dir)
    Application.put_env(:manavault, :ocr_runner, fn _path -> {:ok, ""} end)
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
    assert html =~ "Start camera"
    assert html =~ "Capture card"
    assert html =~ "Align card inside frame"
    assert html =~ ~s|phx-hook="ScannerCamera"|

    image_data = "data:image/png;base64,#{Base.encode64("png bytes")}"
    html = render_hook(view, "capture", %{"image_data" => image_data})

    assert html =~ "Recognition is processing."
    assert html =~ "Saved image:"

    loaded = Catalog.get_scan_session!(scan_session.id)
    assert [item] = loaded.scan_items
    assert item.status in ["processing", "needs_review"]
    assert item.image_path =~ upload_dir
    assert File.read!(item.image_path) == "png bytes"
  end

  test "scanner page reports camera errors", %{conn: conn} do
    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Unsupported camera"})

    {:ok, view, _html} = live(conn, ~p"/scan-sessions/#{scan_session.id}/scanner")

    html = render_hook(view, "camera_error", %{"message" => "Camera permission was denied."})

    assert html =~ "Camera permission was denied."
  end

  test "review page accepts best candidate into collection with edited defaults", %{conn: conn} do
    {:ok, binder} = Catalog.create_location(%{name: "Review Binder", kind: "binder"})
    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Fast review"})

    {:ok, item} =
      Catalog.create_scan_item(scan_session, %{
        status: "recognized",
        image_path: "/tmp/review.jpg"
      })

    {:ok, _candidate} =
      Catalog.create_scan_candidate(item, %{
        printing_id: "scryfall-printing-1",
        oracle_id: "oracle-1",
        source: "ocr",
        confidence: 0.94,
        rank: 1,
        evidence: "{}"
      })

    {:ok, view, html} = live(conn, ~p"/scan-sessions/#{scan_session.id}")

    assert html =~ "Accept best"
    assert html =~ "Exact printing correction"
    assert html =~ "Update review fields"
    assert html =~ "Reject"

    view
    |> form("#scan-item-form-#{item.id}",
      _id: item.id,
      scan_item: %{
        quantity: "2",
        condition: "lightly_played",
        language: "en",
        finish: "nonfoil",
        location_id: "#{binder.id}"
      }
    )
    |> render_submit()

    html = render_click(view, "accept_best", %{"id" => item.id})

    assert html =~ "Accepted scan item ##{item.id}"
    assert html =~ ~s|id="accepted-count"|

    [collection_item] = Catalog.list_collection_items()
    assert collection_item.scryfall_id == "scryfall-printing-1"
    assert collection_item.quantity == 2
    assert collection_item.condition == "lightly_played"
    assert collection_item.location_id == binder.id
  end

  test "review page searches and accepts an exact manual printing", %{conn: conn} do
    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Manual review"})
    {:ok, item} = Catalog.create_scan_item(scan_session, %{status: "needs_review"})

    {:ok, view, _html} = live(conn, ~p"/scan-sessions/#{scan_session.id}")

    html =
      view
      |> form("#printing-search-form-#{item.id}",
        _id: item.id,
        printing_search: %{name: "Time Walk", set_code: "lea", collector_number: "84"}
      )
      |> render_submit()

    assert html =~ "Time Walk · LEA #84"

    html =
      render_click(view, "accept_printing", %{
        "id" => item.id,
        "scryfall-id" => "scryfall-printing-2"
      })

    assert html =~ "Accepted exact printing"

    loaded = Catalog.get_scan_item!(item.id)
    assert loaded.status == "accepted"
    assert loaded.accepted_printing_id == "scryfall-printing-2"
    assert [collection_item] = Catalog.list_collection_items()
    assert collection_item.scryfall_id == "scryfall-printing-2"
  end

  test "review page rejects scan items without creating inventory", %{conn: conn} do
    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Reject review"})
    {:ok, item} = Catalog.create_scan_item(scan_session, %{status: "needs_review"})

    {:ok, view, _html} = live(conn, ~p"/scan-sessions/#{scan_session.id}")

    html = render_click(view, "reject_item", %{"id" => item.id})

    assert html =~ "Rejected scan item ##{item.id}"
    assert Catalog.get_scan_item!(item.id).status == "rejected"
    assert [] = Catalog.list_collection_items()
  end

  test "shows scan session detail sections for pending reviewed and accepted items", %{conn: conn} do
    {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Review batch"})

    {:ok, pending} =
      Catalog.create_scan_item(scan_session, %{
        status: "pending",
        image_path: "/tmp/pending.jpg"
      })

    {:ok, reviewed} =
      Catalog.create_scan_item(scan_session, %{
        status: "needs_review",
        image_path: "/tmp/reviewed.jpg"
      })

    {:ok, accepted} =
      Catalog.create_scan_item(scan_session, %{
        status: "accepted",
        accepted_printing_id: "scryfall-printing-1"
      })

    assert {:ok, _candidate1} =
             Catalog.create_scan_candidate(reviewed, %{
               printing_id: "scryfall-printing-1",
               oracle_id: "oracle-1",
               source: "ocr",
               confidence: 0.92,
               rank: 1,
               evidence: "{}"
             })

    assert {:ok, _candidate2} =
             Catalog.create_scan_candidate(reviewed, %{
               printing_id: "scryfall-printing-2",
               oracle_id: "oracle-2",
               source: "image_match",
               confidence: 0.71,
               rank: 2,
               evidence: "{}"
             })

    {:ok, _view, html} = live(conn, ~p"/scan-sessions/#{scan_session.id}")

    assert html =~ "Review batch"
    assert html =~ ~s|id="pending-count"|
    assert html =~ ~s|id="reviewed-count"|
    assert html =~ ~s|id="accepted-count"|
    assert html =~ "Pending items"
    assert html =~ "Reviewed items"
    assert html =~ "Accepted items"
    assert html =~ ~s|id="scan-item-#{pending.id}"|
    assert html =~ "/tmp/pending.jpg"
    assert html =~ ~s|id="scan-item-#{reviewed.id}"|
    assert html =~ "/tmp/reviewed.jpg"
    assert html =~ "Candidates (2)"
    assert html =~ "Black Lotus · LEA #232"
    assert html =~ "Time Walk · LEA #84"
    assert html =~ "92%"
    assert html =~ "71%"
    assert html =~ ~s|id="scan-item-#{accepted.id}"|
  end
end
