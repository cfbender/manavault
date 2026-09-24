defmodule Manavault.AppearanceTest do
  use Manavault.DataCase

  alias Manavault.Appearance
  alias Manavault.Appearance.Settings
  alias Manavault.Repo

  test "settings default to the claret palette and glass style without writing a row" do
    assert %Settings{palette: "claret", theme_style: "glass"} = Appearance.settings()
    assert Repo.aggregate(Settings, :count) == 0
  end

  test "update_settings saves the owner's palette and style on the singleton row" do
    assert {:ok, %Settings{palette: "nord", theme_style: "glass"}} =
             Appearance.update_settings(%{palette: "nord"})

    assert {:ok, %Settings{palette: "nord", theme_style: "classic"}} =
             Appearance.update_settings(%{"theme_style" => "classic"})

    assert %Settings{id: 1, palette: "nord", theme_style: "classic"} = Appearance.settings()
    assert Repo.aggregate(Settings, :count) == 1
  end

  test "every advertised palette and style is accepted" do
    for palette <- Appearance.palettes(), theme_style <- Appearance.theme_styles() do
      assert Settings.changeset(%Settings{}, %{palette: palette, theme_style: theme_style}).valid?
    end
  end

  test "the changeset rejects unknown palettes and styles" do
    changeset = Settings.changeset(%Settings{}, %{palette: "vaporwave", theme_style: "neon"})

    refute changeset.valid?
    assert %{palette: ["is invalid"], theme_style: ["is invalid"]} = errors_on(changeset)

    assert {:error, _changeset} = Appearance.update_settings(%{palette: "vaporwave"})
    assert %Settings{palette: "claret"} = Appearance.settings()
  end

  test "the changeset rejects blank values" do
    changeset = Settings.changeset(%Settings{}, %{palette: nil})

    assert %{palette: ["can't be blank"]} = errors_on(changeset)
  end

  describe "palette list drift" do
    @theme_module Path.expand("../../assets/react/src/lib/theme.tsx", __DIR__)
    @palettes_css Path.expand("../../assets/css/palettes.css", __DIR__)

    test "the frontend PALETTES list matches the backend list in order" do
      [list] =
        Regex.run(~r/export const PALETTES = \[(.*?)\] as const/s, File.read!(@theme_module),
          capture: :all_but_first
        )

      frontend_ids =
        ~r/id: "([a-z]+)"/ |> Regex.scan(list, capture: :all_but_first) |> List.flatten()

      assert frontend_ids == Appearance.palettes()
    end

    test "palettes.css has light and dark blocks for every palette except the Claret base" do
      blocks =
        ~r/\[data-palette="([a-z]+)"\]\[data-theme="(light|dark)"\]/
        |> Regex.scan(File.read!(@palettes_css), capture: :all_but_first)
        |> Enum.map(&List.to_tuple/1)

      expected =
        for palette <- Appearance.palettes(), palette != "claret", mode <- ~w(dark light) do
          {palette, mode}
        end

      assert Enum.sort(blocks) == Enum.sort(expected)
    end
  end
end
