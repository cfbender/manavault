defmodule Manavault.Catalog.Deck do
  use Ecto.Schema

  import Ecto.Changeset

  @formats ~w(commander standard pioneer modern legacy vintage pauper limited casual)
  @statuses ~w(brewing active archived)

  schema "decks" do
    field :name, :string
    field :format, :string, default: "commander"
    field :status, :string, default: "brewing"
    field :play_count, :integer, default: 0
    field :skip_count, :integer, default: 0
    field :last_played_at, :utc_datetime
    field :primer, :string
    field :ai_analysis, :string
    field :ai_analysis_model, :string
    field :ai_analyzed_at, :utc_datetime
    field :commander_bracket, :integer
    field :commander_bracket_estimate, :integer
    field :share_token, :string
    field :cover_deck_card_id, :id
    field :card_count, :integer, virtual: true
    field :unique_card_count, :integer, virtual: true
    field :cover_image_url, :string, virtual: true
    field :commander_color_identity, {:array, :string}, virtual: true

    has_many :deck_cards, Manavault.Catalog.DeckCard, on_replace: :delete
    has_many :deck_allocations, through: [:deck_cards, :deck_allocations]
    has_many :deck_tags, Manavault.Catalog.DeckTag, on_replace: :delete
    has_many :question_answers, Manavault.Catalog.DeckQuestionAnswer

    timestamps(type: :utc_datetime)
  end

  def formats, do: @formats
  def statuses, do: @statuses

  def changeset(deck, attrs) do
    deck
    |> cast(attrs, [:name, :format, :status, :primer, :cover_deck_card_id])
    |> validate_required([:name, :format, :status])
    |> validate_length(:name, min: 1, max: 120)
    |> validate_length(:primer, max: 50_000)
    |> validate_inclusion(:format, @formats)
    |> validate_inclusion(:status, @statuses)
    |> foreign_key_constraint(:cover_deck_card_id)
  end

  def share_changeset(deck, share_token) do
    deck
    |> change(share_token: share_token)
    |> validate_required([:share_token])
    |> unique_constraint(:share_token)
  end

  def analysis_changeset(deck, attrs) do
    deck
    |> cast(attrs, [
      :ai_analysis,
      :ai_analysis_model,
      :ai_analyzed_at,
      :commander_bracket,
      :commander_bracket_estimate
    ])
    |> validate_required([:ai_analysis, :ai_analysis_model, :ai_analyzed_at])
    |> validate_length(:ai_analysis, max: 100_000)
    |> validate_length(:ai_analysis_model, max: 200)
    |> validate_number(:commander_bracket,
      greater_than_or_equal_to: 1,
      less_than_or_equal_to: 5
    )
    |> validate_number(:commander_bracket_estimate,
      greater_than_or_equal_to: 1,
      less_than_or_equal_to: 5
    )
  end

  def disable_share_changeset(deck), do: change(deck, share_token: nil)
end
