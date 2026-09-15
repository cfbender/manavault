defmodule Manavault.AI.Provider do
  @moduledoc false

  alias Manavault.AI.Settings

  @type analysis :: %{
          required(:summary) => String.t(),
          required(:themes) => [String.t()],
          required(:game_plan) => String.t(),
          required(:strengths) => [String.t()],
          required(:weaknesses) => [String.t()],
          required(:official_bracket) => 1..5 | nil,
          required(:play_bracket) => 1..5 | nil,
          required(:bracket_rationale) => String.t(),
          required(:power_up) => [String.t()],
          required(:power_down) => [String.t()],
          required(:consistency) => [String.t()]
        }

  @callback validate_settings(Settings.t()) ::
              :ok | {:error, :api_key | :model | :base, String.t()}
  @callback analyze_deck(Settings.t(), map()) :: {:ok, analysis()} | {:error, String.t()}
  @callback ask_deck_question(Settings.t(), map(), String.t()) ::
              {:ok, map()} | {:error, String.t()}

  def module("openrouter"), do: {:ok, Manavault.AI.Providers.OpenRouter}
  def module(_provider), do: {:error, "The selected AI provider is not supported."}
end
