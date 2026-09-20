defmodule Manavault.AI.UpdateSettings do
  @moduledoc false

  import Ecto.Changeset, only: [add_error: 3, apply_changes: 1]

  alias Manavault.AI.{Provider, Settings}
  alias Manavault.Repo

  @singleton_id 1

  def settings do
    Repo.get(Settings, @singleton_id) || insert_default!()
  end

  def sanitized_settings do
    settings = settings()

    %{
      id: settings.id,
      provider: settings.provider,
      model: settings.model,
      deck_analysis_instructions: settings.deck_analysis_instructions,
      has_api_key: Settings.secret_present?(settings)
    }
  end

  def run(attrs) do
    settings = settings()
    changeset = Settings.changeset(settings, preserve_api_key(attrs, settings))

    if changeset.valid? do
      candidate = apply_changes(changeset)

      with {:ok, provider} <- Provider.module(candidate.provider),
           :ok <- provider.validate_settings(candidate) do
        Repo.update(changeset)
      else
        {:error, field, message} -> {:error, add_error(changeset, field, message)}
        {:error, message} -> {:error, add_error(changeset, :provider, message)}
      end
    else
      {:error, changeset}
    end
  end

  def configured(%Settings{} = settings) do
    if Settings.secret_present?(settings) and is_binary(settings.model) and settings.model != "" do
      :ok
    else
      {:error, "Configure an AI provider, API key, and model in Settings first."}
    end
  end

  defp insert_default! do
    %Settings{id: @singleton_id, provider: "openrouter"}
    |> Repo.insert!(on_conflict: :nothing)

    Repo.get!(Settings, @singleton_id)
  end

  defp preserve_api_key(attrs, settings) do
    attrs = Enum.into(attrs, %{})
    key = if Map.has_key?(attrs, :api_key), do: :api_key, else: "api_key"

    case Map.fetch(attrs, key) do
      :error -> attrs
      {:ok, nil} -> Map.put(attrs, key, settings.api_key)
      {:ok, value} when is_binary(value) -> preserve_blank_key(attrs, key, value, settings)
      {:ok, _value} -> attrs
    end
  end

  defp preserve_blank_key(attrs, key, value, settings) do
    if String.trim(value) == "", do: Map.put(attrs, key, settings.api_key), else: attrs
  end
end
