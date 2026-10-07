//! Catalog cards (`Manavault.Catalog.Card`, `scryfall_cards`) and the
//! GraphQL `Card` type (`ManavaultWeb.Schema.Catalog.CardTypes`).

use std::sync::Arc;

use async_graphql::{Context, ID, Object, SimpleObject};
use lotus::OracleId;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::SqlitePool;

use crate::catalog::json;
use crate::catalog::printing::{Printing, PrintingConnection};
use crate::tokens::ProducedToken;
use manavault_core::graphql::{NodeKind, PageArgs, global_id};

/// Selects `scryfall_cards` rows aliased `c` into [`CardRecord`]; the
/// argument is the rest of the query after `FROM scryfall_cards AS c`.
#[macro_export]
macro_rules! card_query {
    ($tail:literal $(, $arg:expr)* $(,)?) => {
        sqlx::query_as!(
            $crate::catalog::CardRecord,
            r#"SELECT c.oracle_id AS "oracle_id!: lotus::OracleId", c.name AS "name!",
                 c.normalized_name AS "normalized_name?", c.layout AS "layout?",
                 c.type_line AS "type_line?", c.oracle_text AS "oracle_text?",
                 c.mana_cost AS "mana_cost?", CAST(c.cmc AS REAL) AS "cmc?: f64",
                 c.colors AS "colors!", c.color_identity AS "color_identity!",
                 c.legalities AS "legalities!", c.game_changer AS "game_changer!: bool",
                 c.edhrec_rank AS "edhrec_rank?", c.edhrec_commander_rank AS "edhrec_commander_rank?",
                 CAST(c.edhrec_saltiness AS REAL) AS "edhrec_saltiness?: f64",
                 c.oracle_tags AS "oracle_tags!", c.deck_category AS "deck_category?",
                 c.deck_themes AS "deck_themes!", c.rulings_uri AS "rulings_uri?"
               FROM scryfall_cards AS c "# + $tail
            $(, $arg)*
        )
    };
}

/// A `scryfall_cards` row. JSON columns hold their stored text.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CardRecord {
    pub oracle_id: OracleId,
    pub name: String,
    pub normalized_name: Option<String>,
    pub layout: Option<String>,
    pub type_line: Option<String>,
    pub oracle_text: Option<String>,
    pub mana_cost: Option<String>,
    pub cmc: Option<f64>,
    pub colors: String,
    pub color_identity: String,
    pub legalities: String,
    pub game_changer: bool,
    pub edhrec_rank: Option<i64>,
    pub edhrec_commander_rank: Option<i64>,
    pub edhrec_saltiness: Option<f64>,
    pub oracle_tags: String,
    pub deck_category: Option<String>,
    pub deck_themes: String,
    pub rulings_uri: Option<String>,
}

impl CardRecord {
    /// Whether the card is a token or emblem (`Card.token?/1`).
    #[must_use]
    pub fn is_token(&self) -> bool {
        self.layout
            .as_deref()
            .is_some_and(lotus::card::is_token_layout)
    }

    /// Whether the card is a basic land, snow basics included.
    #[must_use]
    pub fn is_basic_land(&self) -> bool {
        self.type_line.as_deref().is_some_and(lotus::is_basic_land)
    }

    /// Decoded `color_identity`.
    #[must_use]
    pub fn color_identity_list(&self) -> Vec<String> {
        json::strings(&self.color_identity)
    }

    /// Decoded `colors`.
    #[must_use]
    pub fn colors_list(&self) -> Vec<String> {
        json::strings(&self.colors)
    }
}

/// SQL predicate keeping only playable (non-token) cards aliased `c`
/// (`Card.non_token/0`). Cards imported before layouts were recorded have no
/// layout and count as playable.
pub const NON_TOKEN_SQL: &str =
    "(c.layout IS NULL OR c.layout NOT IN ('token', 'double_faced_token', 'emblem'))";

/// SQL predicate keeping only token cards aliased `c` (`Card.token/0`).
pub const TOKEN_SQL: &str = "c.layout IN ('token', 'double_faced_token', 'emblem')";

/// Loads one card row.
pub async fn load_record(
    pool: &SqlitePool,
    oracle_id: &OracleId,
) -> Result<Option<CardRecord>, sqlx::Error> {
    card_query!("WHERE c.oracle_id = ?1", oracle_id)
        .fetch_optional(pool)
        .await
}

/// Loads card rows by oracle id, in no particular order.
pub async fn load_records(
    pool: &SqlitePool,
    oracle_ids: &[OracleId],
) -> Result<Vec<CardRecord>, sqlx::Error> {
    if oracle_ids.is_empty() {
        return Ok(Vec::new());
    }
    let ids = crate::catalog::sql::json_list(oracle_ids);
    card_query!(
        "WHERE c.oracle_id IN (SELECT value FROM json_each(?1))",
        ids
    )
    .fetch_all(pool)
    .await
}

/// A card as a GraphQL object, optionally with its printings already loaded
/// (search results and `card(id:)` preload them).
#[derive(Debug, Clone)]
pub struct Card {
    pub record: Arc<CardRecord>,
    pub printings: Option<Arc<Vec<Printing>>>,
}

impl std::ops::Deref for Card {
    type Target = CardRecord;

    fn deref(&self) -> &CardRecord {
        &self.record
    }
}

impl From<CardRecord> for Card {
    fn from(record: CardRecord) -> Self {
        Self {
            record: Arc::new(record),
            printings: None,
        }
    }
}

impl From<Arc<CardRecord>> for Card {
    fn from(record: Arc<CardRecord>) -> Self {
        Self {
            record,
            printings: None,
        }
    }
}

impl Card {
    /// The card without printings (`Repo.get(Card, oracle_id)`).
    pub async fn load(
        pool: &SqlitePool,
        oracle_id: &OracleId,
    ) -> Result<Option<Card>, sqlx::Error> {
        Ok(load_record(pool, oracle_id).await?.map(Card::from))
    }

    /// The card with every printing and its owned count, newest first
    /// (`Catalog.get_card_with_printings/1`).
    pub async fn load_with_printings(
        pool: &SqlitePool,
        oracle_id: &OracleId,
    ) -> Result<Option<Card>, sqlx::Error> {
        let Some(record) = load_record(pool, oracle_id).await? else {
            return Ok(None);
        };
        let record = Arc::new(record);
        let mut printings = crate::catalog::printing::printings_with_owned_counts(
            pool,
            std::slice::from_ref(oracle_id),
        )
        .await?;
        let printings = printings
            .remove(oracle_id)
            .unwrap_or_default()
            .into_iter()
            .map(|printing| printing.with_card(record.clone()))
            .collect();
        Ok(Some(Card {
            record,
            printings: Some(Arc::new(printings)),
        }))
    }

    /// Cards by oracle id, keyed by id.
    pub async fn load_many(
        pool: &SqlitePool,
        oracle_ids: &[OracleId],
    ) -> Result<std::collections::HashMap<OracleId, Card>, sqlx::Error> {
        Ok(load_records(pool, oracle_ids)
            .await?
            .into_iter()
            .map(|record| (record.oracle_id.clone(), Card::from(record)))
            .collect())
    }

    async fn printings_list(&self, ctx: &Context<'_>) -> async_graphql::Result<Arc<Vec<Printing>>> {
        if let Some(printings) = &self.printings {
            return Ok(printings.clone());
        }
        let printings = crate::catalog::loader::printings_of(ctx, &self.record.oracle_id).await?;
        Ok(Arc::new(
            printings
                .iter()
                .cloned()
                .map(|printing| printing.with_card(self.record.clone()))
                .collect(),
        ))
    }
}

/// A Scryfall oracle tag stored on a card (`:scryfall_oracle_tag`).
#[derive(Debug, Clone)]
pub struct ScryfallOracleTag(pub serde_json::Map<String, Value>);

fn required(value: Option<String>, field: &str) -> async_graphql::Result<String> {
    value.ok_or_else(|| {
        async_graphql::Error::new(format!(
            "Cannot return null for non-nullable field ScryfallOracleTag.{field}"
        ))
    })
}

#[Object]
impl ScryfallOracleTag {
    async fn id(&self) -> async_graphql::Result<ID> {
        required(json::scalar_text(self.0.get("id")), "id").map(ID)
    }

    async fn slug(&self) -> async_graphql::Result<String> {
        required(json::scalar_text(self.0.get("slug")), "slug")
    }

    async fn label(&self) -> async_graphql::Result<String> {
        required(json::scalar_text(self.0.get("label")), "label")
    }

    async fn weight(&self) -> Option<String> {
        json::scalar_text(json::truthy(self.0.get("weight")))
    }

    async fn annotation(&self) -> Option<String> {
        json::scalar_text(self.0.get("annotation"))
    }
}

/// A Scryfall ruling (`:card_ruling`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, SimpleObject)]
pub struct CardRuling {
    pub source: Option<String>,
    pub published_at: Option<String>,
    pub comment: String,
}

/// A format legality (`:card_legality`).
#[derive(Debug, Clone, PartialEq, Eq, SimpleObject)]
pub struct CardLegality {
    pub format: String,
    pub status: String,
}

/// Legality entries with string statuses, sorted by format
/// (`CardFields.legality_entries/1`).
#[must_use]
pub fn legality_entries(legalities: &str) -> Vec<CardLegality> {
    let mut entries: Vec<CardLegality> = json::object(legalities)
        .into_iter()
        .filter_map(|(format, status)| match status {
            Value::String(status) => Some(CardLegality { format, status }),
            _ => None,
        })
        .collect();
    entries.sort_by(|a, b| a.format.cmp(&b.format));
    entries
}

#[Object]
impl Card {
    /// The ID of an object
    pub async fn id(&self) -> ID {
        global_id(NodeKind::Card, &self.record.oracle_id)
    }

    async fn oracle_id(&self) -> ID {
        ID(self.record.oracle_id.to_string())
    }

    async fn name(&self) -> &str {
        &self.record.name
    }

    async fn type_line(&self) -> Option<&str> {
        self.record.type_line.as_deref()
    }

    async fn oracle_text(&self) -> Option<&str> {
        self.record.oracle_text.as_deref()
    }

    async fn mana_cost(&self) -> Option<&str> {
        self.record.mana_cost.as_deref()
    }

    async fn cmc(&self) -> Option<f64> {
        self.record.cmc
    }

    async fn layout(&self) -> Option<&str> {
        self.record.layout.as_deref()
    }

    async fn colors(&self) -> Option<Vec<Option<String>>> {
        Some(json::string_list(&self.record.colors))
    }

    async fn color_identity(&self) -> Option<Vec<Option<String>>> {
        Some(json::string_list(&self.record.color_identity))
    }

    async fn game_changer(&self) -> bool {
        self.record.game_changer
    }

    async fn edhrec_rank(&self) -> Option<i64> {
        self.record.edhrec_rank
    }

    async fn edhrec_commander_rank(&self) -> Option<i64> {
        self.record.edhrec_commander_rank
    }

    async fn edhrec_saltiness(&self) -> Option<f64> {
        self.record.edhrec_saltiness
    }

    async fn oracle_tags(&self) -> Option<Vec<Option<ScryfallOracleTag>>> {
        let tags = match json::decode(&self.record.oracle_tags) {
            Some(Value::Array(items)) => items
                .into_iter()
                .map(|item| match item {
                    Value::Object(map) => Some(ScryfallOracleTag(map)),
                    _ => None,
                })
                .collect(),
            _ => Vec::new(),
        };
        Some(tags)
    }

    async fn deck_category(&self) -> Option<&str> {
        self.record.deck_category.as_deref()
    }

    async fn deck_themes(&self) -> Option<Vec<Option<String>>> {
        Some(json::string_list(&self.record.deck_themes))
    }

    async fn rulings(&self, ctx: &Context<'_>) -> Vec<CardRuling> {
        crate::catalog::scryfall::rulings::card_rulings(
            manavault_core::graphql::state(ctx),
            self.record.rulings_uri.as_deref(),
        )
        .await
    }

    async fn legalities(&self) -> Vec<CardLegality> {
        legality_entries(&self.record.legalities)
    }

    async fn printings(
        &self,
        ctx: &Context<'_>,
        after: Option<String>,
        first: Option<i32>,
        before: Option<String>,
        last: Option<i32>,
    ) -> async_graphql::Result<Option<PrintingConnection>> {
        let printings = self.printings_list(ctx).await?;
        let args = PageArgs::new(after, first, before, last);
        let page = manavault_core::graphql::relay::connection_from_list(
            printings.as_ref().clone(),
            &args,
            None,
        )?;
        Ok(Some(page.into()))
    }

    /// A single representative printing: the first with a usable image
    /// (`CardFields.card_primary_printing/3`).
    async fn primary_printing(&self, ctx: &Context<'_>) -> async_graphql::Result<Option<Printing>> {
        let printings = self.printings_list(ctx).await?;
        Ok(crate::catalog::printing::primary_printing(&printings).cloned())
    }

    /// Tokens this card creates, per Scryfall's related-parts links.
    async fn produced_tokens(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<Vec<ProducedToken>> {
        let tokens = crate::catalog::loader::produced_tokens(ctx, &self.record.oracle_id).await?;
        Ok(tokens.as_ref().clone())
    }
}

manavault_core::connection_types!(CardConnection, CardEdge, Card);
