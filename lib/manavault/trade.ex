defmodule Manavault.Trade do
  @moduledoc """
  Public trade context API.

  The "for trade" flag on collection items lives on `Manavault.Catalog.CollectionItem`
  (see `Manavault.Catalog` filters/update inputs); this context owns the want list —
  cards the owner is looking to acquire — and the public wants-list share link
  (see `Manavault.Trade.WantsShare`).
  """

  import Ecto.Query

  alias Manavault.Catalog
  alias Manavault.Catalog.{Card, Decklists, Printing, Util}
  alias Manavault.Repo
  alias Manavault.Trade.{Want, WantsShare}

  @doc "Every want, newest first."
  def list_wants do
    Want
    |> order_by([w], desc: w.inserted_at, desc: w.id)
    |> preload([:card, :preferred_printing])
    |> Repo.all()
  end

  @doc "Wants for the given oracle ids, newest first."
  def wants_by_oracle_ids([]), do: []

  def wants_by_oracle_ids(oracle_ids) when is_list(oracle_ids) do
    Want
    |> where([w], w.oracle_id in ^oracle_ids)
    |> order_by([w], desc: w.inserted_at, desc: w.id)
    |> preload([:card, :preferred_printing])
    |> Repo.all()
  end

  def get_want!(id) do
    Want
    |> preload([:card, :preferred_printing])
    |> Repo.get!(id)
  end

  @doc """
  Resolves `name` to a card and records a want for it. If the card already
  has a *generic* want (no specific printing), bumps its quantity by
  `quantity` instead of creating a duplicate row — a want for a specific
  printing of the same card (see `create_want_by_printing/2`) is left
  untouched. Returns `{:error, :not_found}` when no card matches `name`.
  """
  def create_want_by_name(name, quantity \\ nil) when is_binary(name) do
    quantity = normalize_quantity(quantity)

    case find_card_by_name(name) do
      %Card{oracle_id: oracle_id} -> upsert_want(oracle_id, nil, quantity)
      nil -> {:error, :not_found}
    end
  end

  @doc """
  Resolves `scryfall_id` to a printing (and its card) and records a want
  for that exact printing. If the card already has a want for this
  printing, bumps its quantity by `quantity` instead of creating a
  duplicate row — a generic want for the same card (no specific printing)
  is left untouched, so the two may coexist. Returns `{:error, :not_found}`
  when no printing matches `scryfall_id`.
  """
  def create_want_by_printing(scryfall_id, quantity \\ nil) when is_binary(scryfall_id) do
    quantity = normalize_quantity(quantity)

    case Catalog.get_printing_by_scryfall_id(scryfall_id) do
      %Printing{oracle_id: oracle_id} -> upsert_want(oracle_id, scryfall_id, quantity)
      nil -> {:error, :not_found}
    end
  end

  def update_want_quantity(%Want{} = want, quantity) do
    case want |> Want.quantity_changeset(%{quantity: quantity}) |> Repo.update() do
      {:ok, want} -> {:ok, Repo.preload(want, [:card, :preferred_printing])}
      error -> error
    end
  end

  def delete_want(%Want{} = want), do: Repo.delete(want)

  @doc "Printing image URL for a want, preferring its preferred printing when set."
  def want_image_url(%Want{preferred_printing: %Printing{} = printing}) do
    printing_image_url(printing)
  end

  def want_image_url(%Want{oracle_id: oracle_id}) do
    Printing
    |> where([p], p.oracle_id == ^oracle_id)
    |> order_by([p], desc: p.released_at, asc: p.set_code, asc: p.collector_number)
    |> limit(1)
    |> Repo.one()
    |> printing_image_url()
  end

  @doc "The current public wants-list share token, or `nil` if none exists yet."
  defdelegate wants_share_token(), to: WantsShare, as: :token

  @doc "Returns the wants-list share token, creating one on first use."
  defdelegate ensure_wants_share_token(), to: WantsShare, as: :ensure_token

  @doc """
  The public wants list for `token`, or `nil` unless it matches the
  stored share token.
  """
  defdelegate wants_list_by_share_token(token), to: WantsShare, as: :list_by_token

  defp normalize_quantity(quantity) when is_integer(quantity) and quantity > 0, do: quantity
  defp normalize_quantity(_quantity), do: 1

  defp find_card_by_name(name) do
    normalized = name |> Decklists.normalize_card_name() |> String.downcase()

    Card
    |> where([card], fragment("lower(?)", card.name) == ^normalized)
    |> Repo.one()
  end

  defp upsert_want(oracle_id, preferred_printing_id, quantity) do
    %Want{}
    |> Want.changeset(%{
      oracle_id: oracle_id,
      preferred_printing_id: preferred_printing_id,
      quantity: quantity
    })
    |> Repo.insert()
    |> case do
      {:ok, want} ->
        {:ok, Repo.preload(want, [:card, :preferred_printing])}

      {:error, changeset} ->
        handle_insert_conflict(changeset, oracle_id, preferred_printing_id, quantity)
    end
  end

  defp handle_insert_conflict(changeset, oracle_id, preferred_printing_id, quantity) do
    if oracle_id_taken?(changeset) do
      bump_existing_want(oracle_id, preferred_printing_id, quantity)
    else
      {:error, changeset}
    end
  end

  defp oracle_id_taken?(changeset) do
    Keyword.has_key?(changeset.errors, :oracle_id)
  end

  defp bump_existing_want(oracle_id, preferred_printing_id, quantity) do
    Want
    |> where([w], w.oracle_id == ^oracle_id)
    |> matching_printing(preferred_printing_id)
    |> Repo.one()
    |> case do
      nil -> upsert_want(oracle_id, preferred_printing_id, quantity)
      %Want{} = want -> update_want_quantity(want, want.quantity + quantity)
    end
  end

  defp matching_printing(query, nil), do: where(query, [w], is_nil(w.preferred_printing_id))

  defp matching_printing(query, preferred_printing_id),
    do: where(query, [w], w.preferred_printing_id == ^preferred_printing_id)

  defp printing_image_url(%Printing{image_uris: image_uris}) do
    image_uris |> Util.decode_json(%{}) |> image_url()
  end

  defp printing_image_url(nil), do: nil

  defp image_url(%{} = image_uris) do
    image_uris["normal"] || image_uris["large"] || image_uris["small"] || image_uris["png"]
  end

  defp image_url([first | _rest]), do: image_url(first)
  defp image_url(_image_uris), do: nil
end
