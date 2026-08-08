defmodule Manavault.Catalog.Card do
  use Ecto.Schema

  import Ecto.Changeset

  alias Manavault.Catalog.Search.NameMatch

  @primary_key {:oracle_id, :string, []}
  @foreign_key_type :string
  schema "scryfall_cards" do
    field :name, :string
    field :normalized_name, :string
    field :type_line, :string
    field :oracle_text, :string
    field :mana_cost, :string
    field :cmc, :float
    field :colors, :string, default: "[]"
    field :color_identity, :string, default: "[]"
    field :legalities, :string, default: "{}"
    field :game_changer, :boolean, default: false
    field :edhrec_rank, :integer
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

  def changeset(card, attrs) do
    card
    |> cast(attrs, [
      :oracle_id,
      :name,
      :type_line,
      :oracle_text,
      :mana_cost,
      :cmc,
      :colors,
      :color_identity,
      :legalities,
      :game_changer,
      :edhrec_rank,
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
