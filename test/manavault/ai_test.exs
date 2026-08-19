defmodule Manavault.AITest do
  use Manavault.DataCase, async: false

  import ExUnit.CaptureLog

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
               model: "anthropic/claude-sonnet-4",
               deck_analysis_instructions: "  Never suggest infinite combos.  "
             })

    assert settings.api_key == "test-openrouter-key"
    assert settings.deck_analysis_instructions == "Never suggest infinite combos."

    assert AI.sanitized_settings() == %{
             id: 1,
             provider: "openrouter",
             model: "anthropic/claude-sonnet-4",
             deck_analysis_instructions: "Never suggest infinite combos.",
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
    assert updated.deck_analysis_instructions == "Never suggest infinite combos."

    assert {:ok, cleared} =
             AI.update_settings(%{
               provider: "openrouter",
               model: "openai/gpt-5-mini",
               deck_analysis_instructions: "  "
             })

    assert cleared.deck_analysis_instructions == nil
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
        model: "anthropic/claude-sonnet-4",
        deck_analysis_instructions:
          "Never suggest infinite combos. Add a Budget upgrades section."
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
      assert request["max_tokens"] == 20_000
      refute Map.has_key?(request, "max_completion_tokens")
      system_prompt = get_in(request, ["messages", Access.at(0), "content"])
      assert system_prompt =~ "Use deeper reasoning"
      assert system_prompt =~ "rather than making the final response longer"
      assert system_prompt =~ "Never suggest infinite combos."
      assert system_prompt =~ "Add a Budget upgrades section."
      user_prompt = get_in(request, ["messages", Access.at(1), "content"])
      assert user_prompt =~ "Test Commander"
      assert user_prompt =~ ~s("land_count":0)
      assert user_prompt =~ ~s("nonland_count":1)

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
        consistency: ["Improve the mana curve"],
        custom_sections: [
          %{
            title: "Budget upgrades",
            content: "- Add [[Swords to Plowshares]] before premium interaction."
          }
        ]
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
    assert analyzed.ai_analysis =~ "## Budget upgrades"
    assert analyzed.ai_analysis =~ "[[Swords to Plowshares]]"

    persisted = Catalog.get_deck!(deck.id)
    assert persisted.ai_analysis == analyzed.ai_analysis
    assert persisted.ai_analysis_model == "anthropic/claude-sonnet-4"
    assert %DateTime{} = persisted.ai_analyzed_at
  end

  test "saves successful deck questions newest first without changing the analysis" do
    {:ok, _settings} =
      %Settings{id: 1}
      |> Settings.changeset(%{
        provider: "openrouter",
        api_key: "test-openrouter-key",
        model: "anthropic/claude-sonnet-4",
        deck_analysis_instructions: "Never suggest infinite combos."
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

      assert request["response_format"]["type"] == "json_schema"
      assert request["plugins"] == [%{"id" => "response-healing"}]
      assert request["max_tokens"] == 8_000
      refute Map.has_key?(request, "max_completion_tokens")
      refute Map.has_key?(request, "reasoning")

      refute request |> get_in(["messages", Access.at(0), "content"]) =~
               "Never suggest infinite combos."

      assert request["response_format"]["json_schema"]["schema"]["required"] == [
               "answer",
               "recommended_additions"
             ]

      user_prompt = get_in(request, ["messages", Access.at(1), "content"])

      assert user_prompt =~ "Test Commander"
      assert user_prompt =~ ~s("commander_color_identity":["W"])
      assert user_prompt =~ ~s("color_identity":["W"])
      assert user_prompt =~ ~s("format_legality":"legal")
      assert user_prompt =~ ~s("land_count":0)
      assert user_prompt =~ ~s("nonland_count":1)

      answer =
        if user_prompt =~ "Return an empty answer" do
          %{"answer" => "   ", "recommended_additions" => []}
        else
          %{
            "answer" => "**Probably not yet.** Add more counter-producing cards first.",
            "recommended_additions" => []
          }
        end

      json_response(conn, 200, %{
        "choices" => [
          %{
            "message" => %{
              "content" => Jason.encode!(answer)
            }
          }
        ]
      })
    end)

    assert {:ok, first_question_answer} =
             AI.ask_deck_question(deck, "  Would Doubling Season be a good fit?  ")

    assert first_question_answer.question == "Would Doubling Season be a good fit?"

    assert first_question_answer.answer ==
             "**Probably not yet.** Add more counter-producing cards first."

    assert %DateTime{} = first_question_answer.inserted_at

    assert {:ok, second_question_answer} =
             AI.ask_deck_question(deck, "How should I protect it?")

    assert Enum.map(Catalog.list_deck_question_answers(deck), & &1.id) == [
             second_question_answer.id,
             first_question_answer.id
           ]

    assert {:error, "The AI provider returned an empty answer."} =
             AI.ask_deck_question(deck, "Return an empty answer")

    assert length(Catalog.list_deck_question_answers(deck)) == 2
    assert Catalog.get_deck!(deck.id).ai_analysis == nil
  end

  test "uses generic question options and logs safe diagnostics when output is truncated" do
    {:ok, _settings} =
      %Settings{id: 1}
      |> Settings.changeset(%{
        provider: "openrouter",
        api_key: "test-openrouter-key",
        model: "google/gemini-3.7-flash"
      })
      |> Repo.insert()

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Diagnostics Deck"})

    Req.Test.stub(@stub, fn conn ->
      {:ok, request_body, conn} = Plug.Conn.read_body(conn)
      request = Jason.decode!(request_body)
      refute Map.has_key?(request, "reasoning")
      assert request["max_tokens"] == 8_000

      json_response(conn, 200, %{
        "provider" => "Google",
        "choices" => [
          %{
            "finish_reason" => "length",
            "native_finish_reason" => "MAX_TOKENS",
            "message" => %{"content" => ~s({"answer":"unfinished)}
          }
        ],
        "usage" => %{
          "prompt_tokens" => 12_345,
          "completion_tokens" => 8_000,
          "completion_tokens_details" => %{"reasoning_tokens" => 7_950}
        }
      })
    end)

    log =
      capture_log(fn ->
        assert {:error, "OpenRouter ran out of output tokens before finishing the answer."} =
                 AI.ask_deck_question(deck, "Do not include this question in logs.")
      end)

    assert log =~ "OpenRouter completion operation=deck_question"
    assert log =~ ~s(model="google/gemini-3.7-flash")
    assert log =~ "finish_reason=\"length\""
    assert log =~ "native_finish_reason=\"MAX_TOKENS\""
    assert log =~ "prompt_tokens=12345"
    assert log =~ "completion_tokens=8000"
    assert log =~ "reasoning_tokens=7950"
    assert log =~ "result=output_token_limit"
    refute log =~ "Do not include this question in logs."
    refute log =~ "unfinished"
  end

  test "logs reasoning-only responses without model-specific request options" do
    {:ok, _settings} =
      %Settings{id: 1}
      |> Settings.changeset(%{
        provider: "openrouter",
        api_key: "test-openrouter-key",
        model: "minimax/minimax-m3"
      })
      |> Repo.insert()

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "MiniMax Deck"})

    Req.Test.stub(@stub, fn conn ->
      {:ok, request_body, conn} = Plug.Conn.read_body(conn)
      request = Jason.decode!(request_body)
      refute Map.has_key?(request, "reasoning")
      assert request["max_tokens"] == 8_000

      json_response(conn, 200, %{
        "provider" => "Parasail",
        "choices" => [
          %{
            "finish_reason" => "stop",
            "native_finish_reason" => "stop",
            "message" => %{"content" => nil, "reasoning" => "Sensitive reasoning content"}
          }
        ],
        "usage" => %{
          "prompt_tokens" => 10_646,
          "completion_tokens" => 768,
          "completion_tokens_details" => %{"reasoning_tokens" => 749}
        }
      })
    end)

    log =
      capture_log(fn ->
        assert {:error, "OpenRouter returned an incomplete answer."} =
                 AI.ask_deck_question(deck, "Do not include this MiniMax question in logs.")
      end)

    assert log =~ ~s(model="minimax/minimax-m3")
    assert log =~ ~s(provider="Parasail")
    assert log =~ "finish_reason=\"stop\""
    assert log =~ "prompt_tokens=10646"
    assert log =~ "completion_tokens=768"
    assert log =~ "reasoning_tokens=749"
    assert log =~ "content_bytes=nil"
    assert log =~ "reasoning_bytes=27"
    assert log =~ "result=incomplete_response"
    refute log =~ "Do not include this MiniMax question in logs."
    refute log =~ "Sensitive reasoning content"
  end

  test "retries catalog-invalid recommendations and only saves the corrected answer" do
    {:ok, _settings} =
      %Settings{id: 1}
      |> Settings.changeset(%{
        provider: "openrouter",
        api_key: "test-openrouter-key",
        model: "anthropic/claude-sonnet-4"
      })
      |> Repo.insert()

    assert {:ok, %{cards_count: 2}} =
             Catalog.import_cards([
               CatalogTestSupport.legal_commander_card(),
               CatalogTestSupport.time_walk()
             ])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Mono-White Deck"})

    assert {:ok, _deck_card} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Test Commander",
               "zone" => "commander"
             })

    attempts = :counters.new(1, [])

    Req.Test.stub(@stub, fn conn ->
      :counters.add(attempts, 1, 1)
      attempt = :counters.get(attempts, 1)
      {:ok, request_body, conn} = Plug.Conn.read_body(conn)

      user_prompt =
        request_body |> Jason.decode!() |> get_in(["messages", Access.at(1), "content"])

      result =
        if attempt == 1 do
          %{
            "answer" => "Add [[Time Walk]] for efficiency.",
            "recommended_additions" => ["Time Walk"]
          }
        else
          assert user_prompt =~ "Time Walk is not legal in commander"
          assert user_prompt =~ "outside the commander's color identity"

          %{
            "answer" => "Keep [[Test Commander]] and add more legal white interaction.",
            "recommended_additions" => []
          }
        end

      json_response(conn, 200, %{
        "choices" => [%{"message" => %{"content" => Jason.encode!(result)}}]
      })
    end)

    assert {:ok, question_answer} = AI.ask_deck_question(deck, "Make this deck stronger.")
    assert :counters.get(attempts, 1) == 2
    assert question_answer.answer =~ "legal white interaction"
    refute question_answer.answer =~ "Time Walk"
    assert [saved] = Catalog.list_deck_question_answers(deck)
    assert saved.id == question_answer.id
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
