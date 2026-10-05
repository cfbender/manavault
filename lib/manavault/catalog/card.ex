defmodule Manavault.Catalog.Card do
  use Ecto.Schema

  import Ecto.Changeset
  import Ecto.Query, only: [dynamic: 2]

  alias Manavault.Catalog.Search.NameMatch

  @token_layouts ~w(token double_faced_token)

  @primary_key {:oracle_id, :string, []}
  @foreign_key_type :string
  schema "scryfall_cards" do
    field :name, :string
    field :normalized_name, :string
    field :layout, :string
    field :type_line, :string
    field :oracle_text, :string
    field :mana_cost, :string
    field :cmc, :float
    field :colors, :string, default: "[]"
    field :color_identity, :string, default: "[]"
    field :legalities, :string, default: "{}"
    field :game_changer, :boolean, default: false
    field :edhrec_rank, :integer
    field :edhrec_commander_rank, :integer
    field :edhrec_saltiness, :float
    field :oracle_tags, :string, default: "[]"
    field :deck_category, :string
    field :deck_themes, :string, default: "[]"
    field :rulings_uri, :string

    has_many :printings, Manavault.Catalog.Printing, foreign_key: :oracle_id

    has_many :deck_cards, Manavault.Catalog.DeckCard,
      foreign_key: :oracle_id,
      references: :oracle_id

    timestamps(type: :utc_datetime)
  end

  @doc "Scryfall layouts that mark a card as a token rather than a playable card."
  def token_layouts, do: @token_layouts

  @doc "Whether the card (or layout) is a token: browsable, but never a collection copy."
  def token?(%__MODULE__{layout: layout}), do: token?(layout)
  def token?(layout) when is_binary(layout), do: layout in @token_layouts
  def token?(_layout), do: false

  @doc """
  Query predicate keeping only playable (non-token) cards, for a query whose
  card binding is named `:card`. Cards imported before layouts were recorded
  have no layout and count as playable.
  """
  def non_token do
    dynamic([card: card], is_nil(card.layout) or card.layout not in ^@token_layouts)
  end

  @doc "Query predicate keeping only token cards, for a query with a `:card` binding."
  def token do
    dynamic([card: card], card.layout in ^@token_layouts)
  end

  @doc """
  Whether this card's oracle text lets its controller choose a color before
  the game begins (e.g. The Prismatic Piper, Clara Oswald). Such commanders
  add one chosen color to the deck's color identity.
  """
  def chooses_color_before_game?(%__MODULE__{oracle_text: oracle_text}),
    do: chooses_color_before_game?(oracle_text)

  def chooses_color_before_game?(oracle_text) when is_binary(oracle_text) do
    Regex.match?(~r/choose a color before the game begins/iu, oracle_text)
  end

  def chooses_color_before_game?(_oracle_text), do: false

  @doc """
  Type line for physical sorting and type grouping. Permanents use their front
  face, not an adventure, prepared spell, or back face. Split spells retain both types.
  """
  def sorting_type_line(type_line) when is_binary(type_line) do
    front = type_line |> String.split("//", parts: 2) |> hd() |> String.trim()

    if Regex.match?(~r/\b(?:Artifact|Battle|Creature|Enchantment|Land|Planeswalker)\b/i, front) do
      front
    else
      type_line
    end
  end

  def sorting_type_line(_type_line), do: ""

  def changeset(card, attrs) do
    card
    |> cast(attrs, [
      :oracle_id,
      :name,
      :layout,
      :type_line,
      :oracle_text,
      :mana_cost,
      :cmc,
      :colors,
      :color_identity,
      :legalities,
      :game_changer,
      :edhrec_rank,
      :edhrec_commander_rank,
      :edhrec_saltiness,
      :oracle_tags,
      :deck_category,
      :deck_themes,
      :rulings_uri
    ])
    |> put_normalized_name()
    |> validate_required([
      :oracle_id,
      :name,
      :normalized_name,
      :color_identity,
      :legalities,
      :game_changer
    ])
  end

  defp put_normalized_name(changeset) do
    case get_field(changeset, :name) do
      name when is_binary(name) ->
        put_change(changeset, :normalized_name, NameMatch.sql_normalize(name))

      _name ->
        changeset
    end
  end
end
