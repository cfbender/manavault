defmodule Manavault.AI.Providers.OpenRouter do
  @moduledoc false

  @behaviour Manavault.AI.Provider

  alias Manavault.AI.{DeckAnalysis, Settings}

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
        %{role: "system", content: DeckAnalysis.system_prompt()},
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
