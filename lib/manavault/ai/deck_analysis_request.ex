defmodule Manavault.AI.DeckAnalysisRequest do
  use Ecto.Schema

  import Ecto.Changeset

  alias Manavault.Catalog.Deck

  schema "deck_analysis_requests" do
    field :source_type, :string
    field :source, :string
    field :source_name, :string
    field :format, :string
    field :analysis, :string
    field :model, :string
    field :commander_bracket, :integer
    field :commander_bracket_estimate, :integer

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(request, attrs) do
    request
    |> cast(attrs, [
      :source_type,
      :source,
      :source_name,
      :format,
      :analysis,
      :model,
      :commander_bracket,
      :commander_bracket_estimate
    ])
    |> validate_required([:source_type, :source, :source_name, :format, :analysis, :model])
    |> validate_inclusion(:source_type, ~w(url text))
    |> validate_inclusion(:format, Deck.formats())
    |> validate_length(:source, max: 200_000)
    |> validate_length(:source_name, max: 200)
    |> validate_length(:analysis, max: 100_000)
    |> validate_length(:model, max: 200)
    |> validate_number(:commander_bracket,
      greater_than_or_equal_to: 1,
      less_than_or_equal_to: 5
    )
    |> validate_number(:commander_bracket_estimate,
      greater_than_or_equal_to: 1,
      less_than_or_equal_to: 5
    )
  end
end
