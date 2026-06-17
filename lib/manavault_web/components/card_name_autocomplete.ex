defmodule ManavaultWeb.CardNameAutocomplete do
  use ManavaultWeb, :live_component

  alias Manavault.Catalog

  @impl true
  def update(assigns, socket) do
    value = input_value(assigns)

    {:ok,
     socket
     |> assign(assigns)
     |> assign_new(:label, fn -> nil end)
     |> assign_new(:placeholder, fn -> nil end)
     |> assign_new(:class, fn -> "input input-bordered w-full" end)
     |> assign_new(:notify_parent, fn -> false end)
     |> assign_new(:query, fn -> value end)
     |> assign_new(:suggestions, fn -> [] end)
     |> sync_query(value)}
  end

  @impl true
  def handle_event("suggest", %{"value" => query}, socket) do
    query = String.trim(query || "")
    notify_parent(socket, query)

    {:noreply,
     socket
     |> assign(:query, query)
     |> assign(:input_value, query)
     |> assign(:suggestions, suggestions(query))}
  end

  def handle_event("select", %{"name" => name}, socket) do
    notify_parent(socket, name)

    {:noreply,
     socket
     |> assign(:query, name)
     |> assign(:input_value, name)
     |> assign(:suggestions, [])}
  end

  def handle_event("clear", _params, socket) do
    {:noreply, assign(socket, :suggestions, [])}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div
      class="form-control relative"
      data-card-name-autocomplete
      phx-click-away="clear"
      phx-target={@myself}
    >
      <label :if={@label} class="label" for={input_id(assigns)}>
        <span class="label-text">{@label}</span>
      </label>
      <input
        id={input_id(assigns)}
        name={input_name(assigns)}
        value={@query}
        type="search"
        class={@class}
        placeholder={@placeholder}
        autocomplete="off"
        phx-keyup="suggest"
        phx-debounce="200"
        phx-target={@myself}
        onkeydown="if (event.key === 'Enter' && this.closest('[data-card-name-autocomplete]')?.querySelector('[data-card-name-suggestions]')) event.preventDefault()"
      />

      <div
        :if={@suggestions != []}
        data-card-name-suggestions
        class="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-2xl"
      >
        <button
          :for={name <- @suggestions}
          type="button"
          class="block w-full px-3 py-2 text-left text-sm hover:bg-base-200 focus:bg-base-200"
          phx-click="select"
          phx-value-name={name}
          phx-target={@myself}
        >
          {name}
        </button>
      </div>
    </div>
    """
  end

  defp sync_query(socket, value) do
    if Map.get(socket.assigns, :input_value) != value do
      socket
      |> assign(:query, value)
      |> assign(:input_value, value)
      |> assign(:suggestions, [])
    else
      socket
    end
  end

  defp suggestions(query), do: Catalog.suggest_card_names(query, limit: 5)

  defp notify_parent(%{assigns: %{notify_parent: true, id: id}}, query) do
    send(self(), {:card_name_autocomplete, id, query})
  end

  defp notify_parent(_socket, _query), do: :ok

  defp input_value(%{value: value}) when is_binary(value), do: value
  defp input_value(%{field: %{value: value}}) when is_binary(value), do: value
  defp input_value(_assigns), do: ""

  defp input_id(%{input_id: input_id}) when is_binary(input_id), do: input_id
  defp input_id(%{field: %{id: id}}), do: id
  defp input_id(%{id: id}), do: "#{id}-input"

  defp input_name(%{name: name}) when is_binary(name), do: name
  defp input_name(%{field: %{name: name}}), do: name
end
