//! The owner's interface appearance (`Manavault.Appearance`): color palette
//! and surface style, stored in the `appearance_settings` singleton row.
//! Light/dark mode stays per device in the browser.

use async_graphql::{Context, MaybeUndefined, Object, SimpleObject};
use sqlx::SqlitePool;

use crate::validation::{BLANK, INVALID, ValidationError};
use async_graphql::ErrorExtensions;

use crate::graphql::state;

type GqlResult<T> = async_graphql::Result<T>;
use crate::timefmt;

/// Palettes in the order the frontend lists them (`assets/react/src/lib/theme.tsx`).
pub const PALETTES: [&str; 12] = [
    "claret",
    "nord",
    "catppuccin",
    "tokyonight",
    "gruvbox",
    "everforest",
    "kanagawa",
    "nightowl",
    "dracula",
    "rosepine",
    "solarized",
    "monochrome",
];

pub const THEME_STYLES: [&str; 2] = ["glass", "classic"];

const SINGLETON_ID: i64 = 1;

/// A palette from [`PALETTES`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Palette(&'static str);

/// A style from [`THEME_STYLES`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ThemeStyle(&'static str);

impl Palette {
    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        PALETTES.iter().find(|p| **p == value).map(|p| Self(p))
    }

    #[must_use]
    pub fn as_str(self) -> &'static str {
        self.0
    }
}

impl ThemeStyle {
    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        THEME_STYLES.iter().find(|s| **s == value).map(|s| Self(s))
    }

    #[must_use]
    pub fn as_str(self) -> &'static str {
        self.0
    }
}

/// The saved appearance.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Appearance {
    pub palette: Palette,
    pub theme_style: ThemeStyle,
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            palette: Palette("claret"),
            theme_style: ThemeStyle("glass"),
        }
    }
}

/// The saved appearance, or the defaults; never writes.
pub async fn settings(db: &SqlitePool) -> Result<Appearance, sqlx::Error> {
    let row = sqlx::query!(
        "SELECT palette, theme_style FROM appearance_settings WHERE id = ?1",
        SINGLETON_ID
    )
    .fetch_optional(db)
    .await?;
    let defaults = Appearance::default();
    Ok(row.map_or(defaults, |row| Appearance {
        palette: Palette::parse(&row.palette).unwrap_or(defaults.palette),
        theme_style: ThemeStyle::parse(&row.theme_style).unwrap_or(defaults.theme_style),
    }))
}

/// Why an update failed.
#[derive(Debug, thiserror::Error)]
pub enum UpdateError {
    #[error(transparent)]
    Invalid(ValidationError),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

fn cast<T: Copy>(
    errors: &mut ValidationError,
    field: &'static str,
    value: MaybeUndefined<String>,
    current: T,
    parse: impl Fn(&str) -> Option<T>,
) -> T {
    match value {
        MaybeUndefined::Undefined => current,
        MaybeUndefined::Null => {
            errors.add(field, BLANK);
            current
        }
        MaybeUndefined::Value(text) if text.trim().is_empty() => {
            errors.add(field, BLANK);
            current
        }
        MaybeUndefined::Value(text) => parse(&text).unwrap_or_else(|| {
            errors.add(field, INVALID);
            current
        }),
    }
}

/// Updates the given fields, keeping the others (`Appearance.update_settings/1`).
pub async fn update(
    db: &SqlitePool,
    palette: MaybeUndefined<String>,
    theme_style: MaybeUndefined<String>,
) -> Result<Appearance, UpdateError> {
    let current = settings(db).await?;
    let mut errors = ValidationError::new();
    let palette = cast(
        &mut errors,
        "palette",
        palette,
        current.palette,
        Palette::parse,
    );
    let theme_style = cast(
        &mut errors,
        "theme_style",
        theme_style,
        current.theme_style,
        ThemeStyle::parse,
    );
    errors.into_result().map_err(UpdateError::Invalid)?;
    let now = timefmt::now();
    let (palette_text, style_text) = (palette.as_str(), theme_style.as_str());
    sqlx::query!(
        "INSERT INTO appearance_settings (id, palette, theme_style, inserted_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(id) DO UPDATE SET palette = excluded.palette,
           theme_style = excluded.theme_style, updated_at = excluded.updated_at",
        SINGLETON_ID,
        palette_text,
        style_text,
        now
    )
    .execute(db)
    .await?;
    Ok(Appearance {
        palette,
        theme_style,
    })
}

#[derive(SimpleObject)]
#[graphql(name = "AppearanceSettings")]
pub struct AppearanceSettingsObject {
    pub palette: String,
    pub theme_style: String,
}

impl From<Appearance> for AppearanceSettingsObject {
    fn from(appearance: Appearance) -> Self {
        Self {
            palette: appearance.palette.as_str().to_owned(),
            theme_style: appearance.theme_style.as_str().to_owned(),
        }
    }
}

#[derive(SimpleObject)]
pub struct UpdateAppearanceSettingsPayload {
    pub appearance_settings: Option<AppearanceSettingsObject>,
}

#[derive(Default)]
pub struct AppearanceQueries;

#[Object]
impl AppearanceQueries {
    async fn appearance_settings(&self, ctx: &Context<'_>) -> GqlResult<AppearanceSettingsObject> {
        Ok(settings(&state(ctx).db).await?.into())
    }
}

#[derive(Default)]
pub struct AppearanceMutations;

#[Object]
impl AppearanceMutations {
    /// Updates the given appearance fields; omitted fields keep their saved values.
    async fn update_appearance_settings(
        &self,
        ctx: &Context<'_>,
        palette: MaybeUndefined<String>,
        theme_style: MaybeUndefined<String>,
    ) -> GqlResult<Option<UpdateAppearanceSettingsPayload>> {
        match update(&state(ctx).db, palette, theme_style).await {
            Ok(settings) => Ok(Some(UpdateAppearanceSettingsPayload {
                appearance_settings: Some(settings.into()),
            })),
            Err(UpdateError::Invalid(errors)) => Err(errors.extend()),
            Err(UpdateError::Db(error)) => Err(error.into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_app::TestApp;
    use serde_json::json;

    fn invalid(result: Result<Appearance, UpdateError>) -> ValidationError {
        match result {
            Err(UpdateError::Invalid(errors)) => errors,
            other => unreachable!("expected a validation error, got {other:?}"),
        }
    }

    async fn row_count(app: &TestApp) -> i64 {
        sqlx::query_scalar("SELECT count(*) FROM appearance_settings")
            .fetch_one(app.db())
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn defaults_without_writing_a_row() {
        let app = TestApp::new().await;
        assert_eq!(settings(app.db()).await.unwrap(), Appearance::default());
        assert_eq!(row_count(&app).await, 0);
    }

    #[tokio::test]
    async fn update_saves_the_singleton_row() {
        let app = TestApp::new().await;
        let saved = update(
            app.db(),
            MaybeUndefined::Value("nord".into()),
            MaybeUndefined::Undefined,
        )
        .await
        .unwrap();
        assert_eq!(saved.palette.as_str(), "nord");
        assert_eq!(saved.theme_style.as_str(), "glass");
        let saved = update(
            app.db(),
            MaybeUndefined::Undefined,
            MaybeUndefined::Value("classic".into()),
        )
        .await
        .unwrap();
        assert_eq!(saved.palette.as_str(), "nord");
        assert_eq!(saved.theme_style.as_str(), "classic");
        assert_eq!(settings(app.db()).await.unwrap(), saved);
        assert_eq!(row_count(&app).await, 1);
    }

    #[tokio::test]
    async fn every_palette_and_style_is_accepted_and_unknown_ones_rejected() {
        let app = TestApp::new().await;
        for palette in PALETTES {
            for style in THEME_STYLES {
                update(
                    app.db(),
                    MaybeUndefined::Value(palette.into()),
                    MaybeUndefined::Value(style.into()),
                )
                .await
                .unwrap();
            }
        }
        let errors = invalid(
            update(
                app.db(),
                MaybeUndefined::Value("vaporwave".into()),
                MaybeUndefined::Value("neon".into()),
            )
            .await,
        );
        assert_eq!(
            errors.to_string(),
            "palette is invalid, theme style is invalid"
        );
        let errors =
            invalid(update(app.db(), MaybeUndefined::Null, MaybeUndefined::Undefined).await);
        assert_eq!(errors.to_string(), "palette can't be blank");
    }

    #[test]
    fn palette_list_matches_the_frontend_in_order() {
        let theme = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../assets/react/src/lib/theme.tsx"
        ))
        .unwrap();
        let start = theme.find("export const PALETTES = [").unwrap();
        let end = start + theme[start..].find("] as const").unwrap();
        let ids: Vec<&str> = regex::Regex::new(r#"id: "([a-z]+)""#)
            .unwrap()
            .captures_iter(&theme[start..end])
            .map(|c| c.get(1).unwrap().as_str())
            .collect();
        assert_eq!(ids, PALETTES);
        let css = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../assets/css/palettes.css"
        ))
        .unwrap();
        let mut blocks: Vec<(String, String)> =
            regex::Regex::new(r#"\[data-palette="([a-z]+)"\]\[data-theme="(light|dark)"\]"#)
                .unwrap()
                .captures_iter(&css)
                .map(|c| (c[1].to_owned(), c[2].to_owned()))
                .collect();
        blocks.sort();
        let mut expected: Vec<(String, String)> = PALETTES
            .iter()
            .filter(|p| **p != "claret")
            .flat_map(|p| {
                [
                    ((*p).to_owned(), "dark".to_owned()),
                    ((*p).to_owned(), "light".to_owned()),
                ]
            })
            .collect();
        expected.sort();
        assert_eq!(blocks, expected);
    }

    #[tokio::test]
    async fn graphql_query_and_mutation() {
        let app = TestApp::new().await;
        assert_eq!(
            app.gql_data("{ appearanceSettings { palette themeStyle } }", json!({}))
                .await,
            json!({"appearanceSettings": {"palette": "claret", "themeStyle": "glass"}})
        );
        let mutation = |args: &str| {
            format!(
                "mutation {{ updateAppearanceSettings({args}) {{ appearanceSettings {{ palette themeStyle }} }} }}"
            )
        };
        let data = app
            .gql_data(&mutation(r#"palette: "gruvbox""#), json!({}))
            .await;
        assert_eq!(
            data["updateAppearanceSettings"]["appearanceSettings"],
            json!({"palette": "gruvbox", "themeStyle": "glass"})
        );
        let data = app
            .gql_data(&mutation(r#"themeStyle: "classic""#), json!({}))
            .await;
        assert_eq!(
            data["updateAppearanceSettings"]["appearanceSettings"],
            json!({"palette": "gruvbox", "themeStyle": "classic"})
        );
        let response = app
            .gql(&mutation(r#"palette: "vaporwave""#), json!({}))
            .await;
        assert_eq!(response["errors"][0]["message"], "palette is invalid");
        assert_eq!(
            settings(app.db()).await.unwrap().palette.as_str(),
            "gruvbox"
        );
    }
}
