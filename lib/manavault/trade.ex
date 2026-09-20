defmodule Manavault.Trade do
  @moduledoc """
  Public trade context API.

  The "for trade" flag on collection items lives on `Manavault.Catalog.CollectionItem`
  (see `Manavault.Catalog` filters/update inputs); this context owns the want list —
  cards the owner is looking to acquire — and the public wants-list share link
  (see `Manavault.Trade.WantsShare`).
  """

  alias Manavault.Catalog.{Printing, Util}
  alias Manavault.Trade.{BinderShare, CreateWant, DeleteWant, Query, UpdateWant, Want, WantsShare}

  @doc "Every want, newest first."
  defdelegate list_wants(), to: Query

  @doc "Wants for the given oracle ids, newest first."
  defdelegate wants_by_oracle_ids(oracle_ids), to: Query
  defdelegate get_want!(id), to: Query

  @doc """
  Resolves `name` to a card and records a want for it. If the card already
  has a *generic* want (no specific printing), bumps its quantity by
  `quantity` instead of creating a duplicate row — a want for a specific
  printing of the same card (see `create_want_by_printing/2`) is left
  untouched. Returns `{:error, :not_found}` when no card matches `name`.
  """
  defdelegate create_want_by_name(name, quantity \\ nil), to: CreateWant, as: :by_name

  @doc """
  Resolves `scryfall_id` to a printing (and its card) and records a want
  for that exact printing. If the card already has a want for this
  printing, bumps its quantity by `quantity` instead of creating a
  duplicate row — a generic want for the same card (no specific printing)
  is left untouched, so the two may coexist. Returns `{:error, :not_found}`
  when no printing matches `scryfall_id`.
  """
  defdelegate create_want_by_printing(scryfall_id, quantity \\ nil),
    to: CreateWant,
    as: :by_printing

  defdelegate update_want_quantity(want, quantity), to: UpdateWant, as: :quantity
  defdelegate delete_want(want), to: DeleteWant, as: :run

  @doc "Printing image URL for a want, preferring its preferred printing when set."
  def want_image_url(%Want{preferred_printing: %Printing{} = printing}) do
    printing_image_url(printing)
  end

  def want_image_url(%Want{oracle_id: oracle_id}) do
    oracle_id
    |> Query.latest_printing()
    |> printing_image_url()
  end

  @doc "The current public wants-list share token, or `nil` if none exists yet."
  defdelegate wants_share_token(), to: WantsShare, as: :token

  @doc "Returns the wants-list share token, creating one on first use."
  defdelegate ensure_wants_share_token(), to: WantsShare, as: :ensure_token
  defdelegate disable_wants_sharing(), to: WantsShare, as: :disable
  defdelegate rotate_wants_share_token(), to: WantsShare, as: :rotate

  @doc """
  The public wants list for `token`, or `nil` unless it matches the
  stored share token.
  """
  defdelegate wants_list_by_share_token(token), to: WantsShare, as: :list_by_token

  @doc "The current public trade-binder share token, or `nil` if none exists yet."
  defdelegate binder_share_token(), to: BinderShare, as: :token

  @doc "Returns the trade-binder share token, creating one on first use."
  defdelegate ensure_binder_share_token(), to: BinderShare, as: :ensure_token
  defdelegate disable_binder_sharing(), to: BinderShare, as: :disable
  defdelegate rotate_binder_share_token(), to: BinderShare, as: :rotate

  @doc """
  The public trade binder for `token`, or `nil` unless it matches the
  stored share token.
  """
  defdelegate binder_list_by_share_token(token), to: BinderShare, as: :list_by_token

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
