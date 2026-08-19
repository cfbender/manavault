defmodule Manavault.AI.Providers.OpenRouter do
  @moduledoc false

  @behaviour Manavault.AI.Provider

  require Logger

  alias Manavault.AI.{DeckAnalysis, DeckQuestion, Settings}

  @api_base "https://openrouter.ai/api/v1"
  @headers [
    {"accept", "application/json"},
    {"content-type", "application/json"},
    {"http-referer", "https://github.com/cfbender/manavault"},
    {"x-openrouter-title", "ManaVault"}
  ]

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
      max_completion_tokens: 3_500,
      temperature: 0.2,
      response_format: %{
        type: "json_schema",
        json_schema: %{
          name: "manavault_deck_analysis",
          strict: true,
          schema: DeckAnalysis.response_schema()
        }
      }
    }

    case Req.post(
           @api_base <> "/chat/completions",
           request_options(settings.api_key, json: request, receive_timeout: 120_000)
         ) do
      {:ok, %Req.Response{status: status, body: body}} when status in 200..299 ->
        decode_analysis(body)

      {:ok, %Req.Response{status: status, body: body}} ->
        {:error, response_error(status, body, "OpenRouter could not analyze this deck.")}

      {:error, exception} ->
        {:error, request_error(exception, "Could not reach OpenRouter to analyze this deck.")}
    end
  end

  @impl true
  def ask_deck_question(%Settings{} = settings, payload, question) do
    request =
      %{
        model: settings.model,
        messages: [
          %{role: "system", content: DeckQuestion.system_prompt()},
          %{role: "user", content: DeckQuestion.user_prompt(question, payload)}
        ],
        max_tokens: 2_000,
        temperature: 0.2,
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
      |> put_question_model_options(settings.model)

    started_at = System.monotonic_time(:millisecond)

    case Req.post(
           @api_base <> "/chat/completions",
           request_options(settings.api_key, json: request, receive_timeout: 120_000)
         ) do
      {:ok, %Req.Response{status: status, body: body}} when status in 200..299 ->
        result = decode_answer(body)
        log_completion(result, "deck_question", settings.model, started_at, status, body)
        result

      {:ok, %Req.Response{status: status, body: body}} ->
        log_completion(:http_error, "deck_question", settings.model, started_at, status, body)
        {:error, response_error(status, body, "OpenRouter could not answer this question.")}

      {:error, exception} ->
        log_request_error("deck_question", settings.model, started_at, exception)
        {:error, request_error(exception, "Could not reach OpenRouter to answer this question.")}
    end
  end

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
        {:error, "OpenRouter ran out of output tokens before finishing the answer."}

      not is_binary(content) ->
        {:error, "OpenRouter returned an incomplete answer."}

      true ->
        case Jason.decode(content) do
          {:ok, answer} when is_map(answer) ->
            {:ok, answer}

          _error when limited? ->
            {:error, "OpenRouter ran out of output tokens before finishing the answer."}

          _error ->
            {:error, "OpenRouter returned an invalid answer."}
        end
    end
  end

  defp decode_answer(_body), do: {:error, "OpenRouter returned an incomplete answer."}

  defp log_completion(result, operation, model, started_at, status, body) do
    level = if match?({:ok, _decoded}, result), do: :info, else: :warning

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
    duration_ms = System.monotonic_time(:millisecond) - started_at

    "OpenRouter completion operation=#{operation} model=#{inspect(model)} status=#{status} " <>
      "duration_ms=#{duration_ms} provider=#{inspect(value(body, "provider"))} " <>
      "finish_reason=#{inspect(value(choice, "finish_reason"))} " <>
      "native_finish_reason=#{inspect(value(choice, "native_finish_reason"))} " <>
      "prompt_tokens=#{inspect(value(usage, "prompt_tokens"))} " <>
      "completion_tokens=#{inspect(value(usage, "completion_tokens"))} " <>
      "reasoning_tokens=#{inspect(value(token_details, "reasoning_tokens"))} " <>
      "content_bytes=#{inspect(if(is_binary(content), do: byte_size(content)))}"
  end

  defp completion_result({:ok, _decoded}), do: "ok"
  defp completion_result({:error, _reason}), do: "invalid_response"
  defp completion_result(:http_error), do: "http_error"

  defp put_question_model_options(request, "google/gemini-3.7-flash" <> _suffix) do
    request
    |> Map.put(:max_tokens, 4_000)
    |> Map.put(:reasoning, %{effort: "low", exclude: true})
  end

  defp put_question_model_options(request, _model), do: request

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
