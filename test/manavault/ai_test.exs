defmodule Manavault.AITest do
  use Manavault.DataCase, async: false

  alias Manavault.AI
  alias Manavault.AI.Settings
  alias Manavault.Catalog
  alias Manavault.CatalogTestSupport

  @stub __MODULE__.OpenRouterStub

  setup do
    previous = Application.get_env(:manavault, :openrouter_req_options)
    Application.put_env(:manavault, :openrouter_req_options, plug: {Req.Test, @stub})

    on_exit(fn ->
      if previous do
        Application.put_env(:manavault, :openrouter_req_options, previous)
      else
        Application.delete_env(:manavault, :openrouter_req_options)
      end
    end)

    :ok
  end

  test "validates settings, encrypts the API key, and preserves it when left blank" do
    stub_settings_validation(["anthropic/claude-sonnet-4", "openai/gpt-5-mini"])

    assert {:ok, settings} =
             AI.update_settings(%{
               provider: "openrouter",
               api_key: "test-openrouter-key",
               model: "anthropic/claude-sonnet-4"
             })

    assert settings.api_key == "test-openrouter-key"

    assert AI.sanitized_settings() == %{
             id: 1,
             provider: "openrouter",
             model: "anthropic/claude-sonnet-4",
             has_api_key: true
           }

    [[raw_api_key]] = Repo.query!("SELECT api_key FROM ai_settings WHERE id = 1").rows
    assert String.starts_with?(raw_api_key, "enc.v1.")
    refute raw_api_key =~ "test-openrouter-key"

    assert {:ok, updated} =
             AI.update_settings(%{
               provider: "openrouter",
               api_key: "  ",
               model: "openai/gpt-5-mini"
             })

    assert updated.api_key == "test-openrouter-key"
    assert updated.model == "openai/gpt-5-mini"
  end

  test "returns a model validation error instead of saving an unknown model" do
    stub_settings_validation(["anthropic/claude-sonnet-4"])

    assert {:error, changeset} =
             AI.update_settings(%{
               provider: "openrouter",
               api_key: "test-openrouter-key",
               model: "unknown/model"
             })

    assert errors_on(changeset).model == ["OpenRouter model \"unknown/model\" was not found."]
    assert AI.sanitized_settings().has_api_key == false
  end

  test "analyzes and persists distinct guideline and practical brackets" do
    {:ok, _settings} =
      %Settings{id: 1}
      |> Settings.changeset(%{
        provider: "openrouter",
        api_key: "test-openrouter-key",
        model: "anthropic/claude-sonnet-4"
      })
      |> Repo.insert()

    commander = Map.put(CatalogTestSupport.legal_commander_card(), "game_changer", true)
    assert {:ok, %{cards_count: 1}} = Catalog.import_cards([commander])

    assert {:ok, deck} =
             Catalog.create_deck(%{"name" => "Guideline Gap", "primer" => "Slow value"})

    assert {:ok, _deck_card} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Test Commander",
               "zone" => "commander"
             })

    Req.Test.stub(@stub, fn conn ->
      assert conn.method == "POST"
      assert conn.request_path == "/api/v1/chat/completions"
      {:ok, request_body, conn} = Plug.Conn.read_body(conn)
      request = Jason.decode!(request_body)
      assert request["model"] == "anthropic/claude-sonnet-4"
      assert request["response_format"]["type"] == "json_schema"
      assert request |> get_in(["messages", Access.at(1), "content"]) =~ "Test Commander"

      analysis = %{
        summary: "A slow commander value deck.",
        themes: ["Value"],
        game_plan: "Develop resources and win late.",
        strengths: ["Resilient commander"],
        weaknesses: ["Slow clock"],
        official_bracket: 2,
        play_bracket: 2,
        bracket_rationale: "One Game Changer raises the guideline bracket, but the list is slow.",
        power_up: ["Add efficient interaction"],
        power_down: ["Replace the Game Changer"],
        consistency: ["Improve the mana curve"]
      }

      json_response(conn, 200, %{
        "choices" => [%{"message" => %{"content" => Jason.encode!(analysis)}}]
      })
    end)

    assert {:ok, analyzed} = AI.analyze_deck(deck)
    assert analyzed.commander_bracket == 3
    assert analyzed.commander_bracket_estimate == 2
    assert analyzed.ai_analysis =~ "**Bracket 3 (plays like Bracket 2)**"
    assert analyzed.ai_analysis =~ "## Ways to power it up"

    persisted = Catalog.get_deck!(deck.id)
    assert persisted.ai_analysis == analyzed.ai_analysis
    assert persisted.ai_analysis_model == "anthropic/claude-sonnet-4"
    assert %DateTime{} = persisted.ai_analyzed_at
  end

  test "answers a one-off deck question without changing the saved analysis" do
    {:ok, _settings} =
      %Settings{id: 1}
      |> Settings.changeset(%{
        provider: "openrouter",
        api_key: "test-openrouter-key",
        model: "anthropic/claude-sonnet-4"
      })
      |> Repo.insert()

    assert {:ok, %{cards_count: 1}} =
             Catalog.import_cards([CatalogTestSupport.legal_commander_card()])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Counter Deck"})

    assert {:ok, _deck_card} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Test Commander",
               "zone" => "commander"
             })

    Req.Test.stub(@stub, fn conn ->
      assert conn.method == "POST"
      assert conn.request_path == "/api/v1/chat/completions"
      {:ok, request_body, conn} = Plug.Conn.read_body(conn)
      request = Jason.decode!(request_body)

      refute Map.has_key?(request, "response_format")

      assert request |> get_in(["messages", Access.at(1), "content"]) =~
               "Would Doubling Season be a good fit?"

      assert request |> get_in(["messages", Access.at(1), "content"]) =~ "Test Commander"

      json_response(conn, 200, %{
        "choices" => [
          %{
            "message" => %{
              "content" => "**Probably not yet.** Add more counter-producing cards first."
            }
          }
        ]
      })
    end)

    assert {:ok, answer} =
             AI.ask_deck_question(deck, "  Would Doubling Season be a good fit?  ")

    assert answer == "**Probably not yet.** Add more counter-producing cards first."
    assert Catalog.get_deck!(deck.id).ai_analysis == nil
  end

  defp stub_settings_validation(model_ids) do
    Req.Test.stub(@stub, fn conn ->
      assert Plug.Conn.get_req_header(conn, "authorization") == ["Bearer test-openrouter-key"]

      case conn.request_path do
        "/api/v1/key" ->
          json_response(conn, 200, %{"data" => %{"label" => "ManaVault"}})

        "/api/v1/models" ->
          json_response(conn, 200, %{"data" => Enum.map(model_ids, &%{"id" => &1})})
      end
    end)
  end

  defp json_response(conn, status, body) do
    conn
    |> Plug.Conn.put_resp_header("content-type", "application/json")
    |> Plug.Conn.send_resp(status, Jason.encode!(body))
  end
end
