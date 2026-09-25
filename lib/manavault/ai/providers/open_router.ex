defmodule Manavault.AI.Providers.OpenRouter do
  @moduledoc false

  @behaviour Manavault.AI.Provider

  require Logger

  alias Manavault.AI.{CardLookupTool, DeckAnalysis, DeckQuestion, Settings}

  @api_base "https://openrouter.ai/api/v1"
  # Rounds in which the model may call tools before it is forced to answer.
  @max_tool_rounds 4
  @headers [
    {"accept", "application/json"},
    {"content-type", "application/json"},
    {"http-referer", "https://github.com/cfbender/manavault"},
    {"x-openrouter-title", "ManaVault"}
  ]
  @answer_token_limit_error "OpenRouter ran out of output tokens before finishing the answer."
  @answer_incomplete_error "OpenRouter returned an incomplete answer."
  @answer_invalid_error "OpenRouter returned an invalid answer."

  @impl true
  def validate_settings(%Settings{} = settings) do
    with :ok <- validate_api_key(settings.api_key),
         {:ok, models} <- fetch_models(settings.api_key),
         true <- Enum.any?(models, &(Map.get(&1, "id") == settings.model)) do
      :ok
    else
      false ->
        {:error, :model, "OpenRouter model \"#{settings.model}\" was not found."}

      {:error, _field, _message} = error ->
        error
    end
  end

  @impl true
  def analyze_deck(%Settings{} = settings, payload) do
    request = %{
      model: settings.model,
      messages: [
        %{
          role: "system",
          content: DeckAnalysis.system_prompt(settings.deck_analysis_instructions)
        },
        %{role: "user", content: DeckAnalysis.user_prompt(payload)}
      ],
      max_tokens: 20_000,
      temperature: 0.2,
      tools: CardLookupTool.definitions(),
      response_format: %{
        type: "json_schema",
        json_schema: %{
          name: "manavault_deck_analysis",
          strict: true,
          schema: DeckAnalysis.response_schema(settings.deck_analysis_instructions)
        }
      }
    }

    complete(request, settings, %{
      operation: "deck_analysis",
      decode: &decode_analysis/1,
      http_error: "OpenRouter could not analyze this deck.",
      request_error: "Could not reach OpenRouter to analyze this deck."
    })
  end

  @impl true
  def ask_deck_question(%Settings{} = settings, payload, question) do
    request = %{
      model: settings.model,
      messages: [
        %{role: "system", content: DeckQuestion.system_prompt()},
        %{role: "user", content: DeckQuestion.user_prompt(question, payload)}
      ],
      max_tokens: 20_000,
      temperature: 0.2,
      tools: CardLookupTool.definitions(),
      plugins: [%{id: "response-healing"}],
      response_format: %{
        type: "json_schema",
        json_schema: %{
          name: "manavault_deck_question_answer",
          strict: true,
          schema: DeckQuestion.response_schema()
        }
      }
    }

    complete(request, settings, %{
      operation: "deck_question",
      decode: &decode_answer/1,
      http_error: "OpenRouter could not answer this question.",
      request_error: "Could not reach OpenRouter to answer this question."
    })
  end

  # Runs the completion, executing any tool calls the model requests and
  # feeding the results back until it returns a final message. After
  # @max_tool_rounds the model is told it may no longer call tools.
  defp complete(request, settings, context, round \\ 0) do
    request =
      if round >= @max_tool_rounds, do: Map.put(request, :tool_choice, "none"), else: request

    started_at = System.monotonic_time(:millisecond)

    case post_completion(request, settings.api_key) do
      {:ok, %Req.Response{status: status, body: body}} when status in 200..299 ->
        case tool_calls(body) do
          [] ->
            result = context.decode.(body)
            log_completion(result, context.operation, settings.model, started_at, status, body)
            result

          calls ->
            log_completion(
              :tool_calls,
              context.operation,
              settings.model,
              started_at,
              status,
              body
            )

            request
            |> Map.update!(:messages, &(&1 ++ [assistant_message(body) | tool_messages(calls)]))
            |> complete(settings, context, round + 1)
        end

      {:ok, %Req.Response{status: 404, body: body}}
      when round == 0 and is_map_key(request, :tools) ->
        if tool_use_unsupported?(body) do
          Logger.warning(
            "OpenRouter model #{inspect(settings.model)} does not support tool use; " <>
              "retrying operation=#{context.operation} without the card lookup tool"
          )

          request |> Map.delete(:tools) |> complete(settings, context, round)
        else
          log_completion(:http_error, context.operation, settings.model, started_at, 404, body)
          {:error, response_error(404, body, context.http_error)}
        end

      {:ok, %Req.Response{status: status, body: body}} ->
        log_completion(:http_error, context.operation, settings.model, started_at, status, body)
        {:error, response_error(status, body, context.http_error)}

      {:error, exception} ->
        log_request_error(context.operation, settings.model, started_at, exception)
        {:error, request_error(exception, context.request_error)}
    end
  end

  defp post_completion(request, api_key) do
    Req.post(
      @api_base <> "/chat/completions",
      request_options(api_key, json: request, receive_timeout: 120_000)
    )
  end

  defp tool_calls(%{"choices" => [%{"message" => %{"tool_calls" => calls}} | _]})
       when is_list(calls),
       do: Enum.filter(calls, &is_map/1)

  defp tool_calls(_body), do: []

  # The assistant turn echoed back verbatim so the model sees its own tool
  # calls (and any reasoning) ahead of the tool results.
  defp assistant_message(%{"choices" => [%{"message" => message} | _]}) do
    message
    |> Map.take(["role", "content", "tool_calls", "reasoning", "reasoning_details"])
    |> Map.put_new("role", "assistant")
    |> Map.put_new("content", nil)
  end

  defp tool_messages(calls) do
    Enum.map(calls, fn call ->
      name = get_in(call, ["function", "name"])
      arguments = call |> get_in(["function", "arguments"]) |> decode_arguments()

      %{
        role: "tool",
        tool_call_id: Map.get(call, "id"),
        name: name,
        content: Jason.encode!(CardLookupTool.call(name, arguments))
      }
    end)
  end

  defp decode_arguments(arguments) when is_binary(arguments) do
    case Jason.decode(arguments) do
      {:ok, decoded} when is_map(decoded) -> decoded
      _error -> %{}
    end
  end

  defp decode_arguments(arguments) when is_map(arguments), do: arguments
  defp decode_arguments(_arguments), do: %{}

  defp tool_use_unsupported?(body) when is_map(body) do
    message = get_in(body, ["error", "message"])
    is_binary(message) and message =~ ~r/tool use/i
  end

  defp tool_use_unsupported?(_body), do: false

  defp validate_api_key(api_key) do
    case Req.get(@api_base <> "/key", request_options(api_key)) do
      {:ok, %Req.Response{status: status}} when status in 200..299 ->
        :ok

      {:ok, %Req.Response{status: 401}} ->
        {:error, :api_key, "OpenRouter rejected the API key."}

      {:ok, %Req.Response{status: status, body: body}} ->
        {:error, :api_key,
         response_error(status, body, "OpenRouter could not validate the API key.")}

      {:error, exception} ->
        {:error, :base,
         request_error(exception, "Could not reach OpenRouter to validate settings.")}
    end
  end

  defp fetch_models(api_key) do
    case Req.get(@api_base <> "/models", request_options(api_key)) do
      {:ok, %Req.Response{status: status, body: %{"data" => models}}}
      when status in 200..299 and is_list(models) ->
        {:ok, models}

      {:ok, %Req.Response{status: status, body: body}} ->
        {:error, :model, response_error(status, body, "OpenRouter could not validate the model.")}

      {:error, exception} ->
        {:error, :base,
         request_error(exception, "Could not reach OpenRouter to validate settings.")}
    end
  end

  defp decode_analysis(%{"choices" => [%{"message" => %{"content" => content}} | _]})
       when is_binary(content) do
    case Jason.decode(content) do
      {:ok, analysis} when is_map(analysis) -> {:ok, analysis}
      _error -> {:error, "OpenRouter returned an invalid deck analysis."}
    end
  end

  defp decode_analysis(_body), do: {:error, "OpenRouter returned an incomplete deck analysis."}

  defp decode_answer(%{"choices" => [choice | _]}) when is_map(choice) do
    content = get_in(choice, ["message", "content"])

    limited? =
      Map.get(choice, "finish_reason") == "length" or
        Map.get(choice, "native_finish_reason") in ["MAX_TOKENS", "max_tokens"]

    cond do
      not is_binary(content) and limited? ->
        {:error, @answer_token_limit_error}

      not is_binary(content) ->
        {:error, @answer_incomplete_error}

      true ->
        case Jason.decode(content) do
          {:ok, answer} when is_map(answer) ->
            {:ok, answer}

          _error when limited? ->
            {:error, @answer_token_limit_error}

          _error ->
            {:error, @answer_invalid_error}
        end
    end
  end

  defp decode_answer(_body), do: {:error, @answer_incomplete_error}

  defp log_completion(result, operation, model, started_at, status, body) do
    level = if match?({:ok, _decoded}, result) or result == :tool_calls, do: :info, else: :warning

    Logger.log(
      level,
      completion_log(operation, model, started_at, status, body) <>
        " result=#{completion_result(result)}"
    )
  end

  defp completion_log(operation, model, started_at, status, body) do
    choice =
      case value(body, "choices") do
        [choice | _rest] when is_map(choice) -> choice
        _other -> %{}
      end

    message = value(choice, "message", %{})
    usage = value(body, "usage", %{})
    token_details = value(usage, "completion_tokens_details", %{})
    content = value(message, "content")
    reasoning = value(message, "reasoning") || value(message, "reasoning_content")
    duration_ms = System.monotonic_time(:millisecond) - started_at

    "OpenRouter completion operation=#{operation} model=#{inspect(model)} status=#{status} " <>
      "duration_ms=#{duration_ms} provider=#{inspect(value(body, "provider"))} " <>
      "finish_reason=#{inspect(value(choice, "finish_reason"))} " <>
      "native_finish_reason=#{inspect(value(choice, "native_finish_reason"))} " <>
      "prompt_tokens=#{inspect(value(usage, "prompt_tokens"))} " <>
      "completion_tokens=#{inspect(value(usage, "completion_tokens"))} " <>
      "reasoning_tokens=#{inspect(value(token_details, "reasoning_tokens"))} " <>
      "content_bytes=#{inspect(if(is_binary(content), do: byte_size(content)))} " <>
      "reasoning_bytes=#{inspect(if(is_binary(reasoning), do: byte_size(reasoning)))}"
  end

  defp completion_result({:ok, _decoded}), do: "ok"
  defp completion_result(:tool_calls), do: "tool_calls"
  defp completion_result({:error, @answer_token_limit_error}), do: "output_token_limit"
  defp completion_result({:error, @answer_incomplete_error}), do: "incomplete_response"
  defp completion_result({:error, @answer_invalid_error}), do: "invalid_response"
  defp completion_result({:error, _reason}), do: "invalid_response"
  defp completion_result(:http_error), do: "http_error"

  defp log_request_error(operation, model, started_at, exception) do
    duration_ms = System.monotonic_time(:millisecond) - started_at

    Logger.warning(
      "OpenRouter completion operation=#{operation} model=#{inspect(model)} " <>
        "duration_ms=#{duration_ms} result=request_error reason=#{request_error_reason(exception)}"
    )
  end

  defp value(map, key, default \\ nil)
  defp value(map, key, default) when is_map(map), do: Map.get(map, key, default)
  defp value(_map, _key, default), do: default

  defp request_error_reason(%{reason: reason}), do: inspect(reason)
  defp request_error_reason(_exception), do: "unknown"

  defp request_options(api_key, overrides \\ []) do
    configured = Application.get_env(:manavault, :openrouter_req_options, [])

    [
      headers: [{"authorization", "Bearer #{api_key}"} | @headers],
      connect_options: [timeout: 10_000],
      receive_timeout: 30_000,
      redirect: false,
      retry: false
    ]
    |> Keyword.merge(configured)
    |> Keyword.merge(overrides)
  end

  defp response_error(status, body, fallback) do
    message = if is_map(body), do: get_in(body, ["error", "message"])

    if is_binary(message) and String.trim(message) != "" do
      "OpenRouter: #{message}"
    else
      "#{fallback} (HTTP #{status})"
    end
  end

  defp request_error(%{reason: :timeout}, fallback), do: fallback <> " The request timed out."
  defp request_error(_exception, fallback), do: fallback
end
