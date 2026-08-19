defmodule ManavaultWeb.Schema.AITest do
  use ManavaultWeb.ConnCase, async: false

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

  test "settings, analysis, and one-off questions use AI without exposing the API key", %{
    conn: conn
  } do
    Req.Test.stub(@stub, &openrouter_response/1)

    settings_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation UpdateAISettings($input: AiSettingsInput!) {
          updateAiSettings(input: $input) {
            aiSettings { provider model deckAnalysisInstructions hasApiKey }
          }
        }
        """,
        "variables" => %{
          "input" => %{
            "provider" => "openrouter",
            "apiKey" => "graphql-openrouter-key",
            "model" => "anthropic/claude-sonnet-4",
            "deckAnalysisInstructions" =>
              "Never suggest infinite combos. Add a Budget upgrades section."
          }
        }
      })

    assert %{
             "data" => %{
               "updateAiSettings" => %{
                 "aiSettings" => %{
                   "provider" => "openrouter",
                   "model" => "anthropic/claude-sonnet-4",
                   "deckAnalysisInstructions" =>
                     "Never suggest infinite combos. Add a Budget upgrades section.",
                   "hasApiKey" => true
                 }
               }
             }
           } = json_response(settings_conn, 200)

    card = Map.put(CatalogTestSupport.legal_commander_card(), "game_changer", true)
    assert {:ok, _result} = Catalog.import_cards([card])
    assert {:ok, deck} = Catalog.create_deck(%{"name" => "GraphQL Analysis"})
    assert {:ok, _deck_card} = Catalog.add_card_to_deck(deck, %{"name" => "Test Commander"})

    analyze_conn =
      post(recycle(conn), "/api/graphql", %{
        "query" => """
        mutation AnalyzeDeck($id: ID!) {
          analyzeDeck(id: $id) {
            deck {
              id
              aiAnalysis
              aiAnalysisModel
              aiAnalyzedAt
              commanderBracket
              commanderBracketEstimate
            }
          }
        }
        """,
        "variables" => %{"id" => global_deck_id(deck)}
      })

    assert %{
             "data" => %{
               "analyzeDeck" => %{
                 "deck" => %{
                   "aiAnalysis" => analysis,
                   "aiAnalysisModel" => "anthropic/claude-sonnet-4",
                   "aiAnalyzedAt" => analyzed_at,
                   "commanderBracket" => 3,
                   "commanderBracketEstimate" => 2
                 }
               }
             }
           } = json_response(analyze_conn, 200)

    assert analysis =~ "Bracket 3 (plays like Bracket 2)"
    assert {:ok, _datetime, 0} = DateTime.from_iso8601(analyzed_at)

    question_conn =
      post(recycle(conn), "/api/graphql", %{
        "query" => """
        mutation AskDeckQuestion($id: ID!, $question: String!) {
          askDeckQuestion(id: $id, question: $question) {
            answer
            questionAnswer { id question answer insertedAt }
          }
        }
        """,
        "variables" => %{
          "id" => global_deck_id(deck),
          "question" => "What should I cut for Doubling Season?"
        }
      })

    assert %{
             "data" => %{
               "askDeckQuestion" => %{
                 "answer" => "Cut the least synergistic top-end card.",
                 "questionAnswer" => %{
                   "id" => question_answer_id,
                   "question" => "What should I cut for Doubling Season?",
                   "answer" => "Cut the least synergistic top-end card.",
                   "insertedAt" => inserted_at
                 }
               }
             }
           } = json_response(question_conn, 200)

    assert {:ok, _datetime, 0} = DateTime.from_iso8601(inserted_at)

    history_conn =
      post(recycle(conn), "/api/graphql", %{
        "query" => """
        query DeckQuestionAnswers($deckId: ID!) {
          deckQuestionAnswers(deckId: $deckId) { id question answer insertedAt }
        }
        """,
        "variables" => %{"deckId" => global_deck_id(deck)}
      })

    assert %{
             "data" => %{
               "deckQuestionAnswers" => [
                 %{
                   "id" => ^question_answer_id,
                   "question" => "What should I cut for Doubling Season?"
                 }
               ]
             }
           } = json_response(history_conn, 200)

    delete_conn =
      post(recycle(conn), "/api/graphql", %{
        "query" => """
        mutation DeleteDeckQuestionAnswer($id: ID!) {
          deleteDeckQuestionAnswer(id: $id) { questionAnswerId }
        }
        """,
        "variables" => %{"id" => question_answer_id}
      })

    assert %{
             "data" => %{
               "deleteDeckQuestionAnswer" => %{"questionAnswerId" => ^question_answer_id}
             }
           } = json_response(delete_conn, 200)

    assert Catalog.list_deck_question_answers(deck) == []
  end

  defp openrouter_response(conn) do
    case {conn.method, conn.request_path} do
      {"GET", "/api/v1/key"} ->
        json_response(conn, 200, %{"data" => %{"label" => "ManaVault"}})

      {"GET", "/api/v1/models"} ->
        json_response(conn, 200, %{"data" => [%{"id" => "anthropic/claude-sonnet-4"}]})

      {"POST", "/api/v1/chat/completions"} ->
        {:ok, request_body, conn} = Plug.Conn.read_body(conn)
        request = Jason.decode!(request_body)

        case get_in(request, ["response_format", "json_schema", "name"]) do
          "manavault_deck_analysis" ->
            assert request |> get_in(["messages", Access.at(0), "content"]) =~
                     "Never suggest infinite combos."

            analysis = %{
              summary: "A slow value deck.",
              themes: ["Value"],
              game_plan: "Build resources and win late.",
              strengths: ["Resilient plan"],
              weaknesses: ["Slow start"],
              official_bracket: 2,
              play_bracket: 2,
              bracket_rationale: "Its single Game Changer raises the guideline bracket.",
              power_up: ["Add interaction"],
              power_down: ["Replace the Game Changer"],
              consistency: ["Improve the curve"],
              custom_sections: [
                %{title: "Budget upgrades", content: "- Start with efficient removal."}
              ]
            }

            json_response(conn, 200, %{
              "choices" => [%{"message" => %{"content" => Jason.encode!(analysis)}}]
            })

          "manavault_deck_question_answer" ->
            refute request |> get_in(["messages", Access.at(0), "content"]) =~
                     "Never suggest infinite combos."

            assert request |> get_in(["messages", Access.at(1), "content"]) =~
                     "What should I cut for Doubling Season?"

            answer = %{
              answer: "Cut the least synergistic top-end card.",
              recommended_additions: []
            }

            json_response(conn, 200, %{
              "choices" => [%{"message" => %{"content" => Jason.encode!(answer)}}]
            })
        end
    end
  end

  defp json_response(conn, status, body) do
    conn
    |> Plug.Conn.put_resp_header("content-type", "application/json")
    |> Plug.Conn.send_resp(status, Jason.encode!(body))
  end

  defp global_deck_id(deck) do
    Absinthe.Relay.Node.to_global_id(:deck, deck.id, ManavaultWeb.Schema)
  end
end
