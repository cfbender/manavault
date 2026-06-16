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
