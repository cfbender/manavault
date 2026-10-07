//! The Relay `Node` interface and the root `node(id:)` field
//! (`ManavaultWeb.Schema`'s `node interface` and `node field`).

use async_graphql::{Context, ID, Interface, Object};
use lotus::{OracleId, ScryfallId};

use crate::catalog::card::Card;
use crate::catalog::printing::Printing;
use crate::collection::item::CollectionItem;
use crate::collection::location::Location;
use crate::decks::{Deck, DeckCard, DeckCardId, DeckId};
use crate::graphql::relay::{self, NodeKind};
use crate::graphql::{Result, internal_error, state, user_error};
use crate::tokens::items::TokenItem;

/// An object with a global id.
#[derive(Interface)]
#[graphql(
    name = "Node",
    field(name = "id", ty = "ID", desc = "The ID of the object.")
)]
pub enum Node {
    Card(Card),
    Printing(Printing),
    CollectionItem(CollectionItem),
    Location(Location),
    Deck(Deck),
    DeckCard(DeckCard),
    TokenItem(TokenItem),
}

#[derive(Default)]
pub struct NodeQueries;

#[Object]
impl NodeQueries {
    /// Fetches an object given its ID
    async fn node(&self, ctx: &Context<'_>, id: ID) -> Result<Option<Node>> {
        let (kind, raw) = decode(ctx, id.as_str())?;
        resolve(ctx, kind, &raw).await
    }
}

/// `Absinthe.Relay.Node.from_global_id/2` against the schema: a type that
/// exists but does not implement `Node` gets its own message.
fn decode(ctx: &Context<'_>, id: &str) -> Result<(NodeKind, String)> {
    let (type_name, raw) = relay::decode_global_id(id).map_err(user_error)?;
    match NodeKind::from_type_name(&type_name) {
        Some(kind) => Ok((kind, raw)),
        None if ctx.schema_env.registry.types.contains_key(&type_name) => Err(user_error(format!(
            "Type `{type_name}' is not a valid node type"
        ))),
        None => Err(user_error(format!("Unknown type `{type_name}'"))),
    }
}

fn internal_int(raw: &str, kind: NodeKind) -> Result<i64> {
    let raw = relay::node_field_id(raw, kind).map_err(user_error)?;
    relay::parse_internal_id(&raw, kind).map_err(user_error)
}

/// The `node field` resolver: each kind loads like its own root field.
async fn resolve(ctx: &Context<'_>, kind: NodeKind, raw: &str) -> Result<Option<Node>> {
    let pool = &state(ctx).db;
    match kind {
        NodeKind::Card => {
            // `QueryResolvers.card/3` falls back to the raw id on any error.
            let id = relay::node_field_id(raw, kind).unwrap_or_else(|_| raw.to_owned());
            Ok(Card::load_with_printings(pool, &OracleId::from(id))
                .await
                .map_err(internal_error)?
                .map(Node::Card))
        }
        NodeKind::Printing => {
            let id = relay::node_field_id(raw, kind).map_err(user_error)?;
            Ok(Printing::load(pool, &ScryfallId::from(id))
                .await
                .map_err(internal_error)?
                .map(Node::Printing))
        }
        NodeKind::CollectionItem => {
            let id = internal_int(raw, kind)?;
            let item = CollectionItem::load(pool, id)
                .await
                .map_err(internal_error)?
                .ok_or_else(|| user_error("Collection item was not found."))?;
            Ok(Some(Node::CollectionItem(item)))
        }
        NodeKind::Location => {
            let id = relay::node_field_id(raw, kind).map_err(user_error)?;
            if id == "unfiled" {
                let totals = crate::collection::queries::location_summaries(pool, None)
                    .await
                    .map_err(internal_error)?
                    .remove(&None)
                    .unwrap_or_default();
                return Ok(Some(Node::Location(Location::unfiled(totals))));
            }
            let id = relay::parse_internal_id(&id, kind).map_err(user_error)?;
            let record = Location::load(pool, id)
                .await
                .map_err(internal_error)?
                .ok_or_else(|| user_error("Location was not found."))?;
            Ok(Some(Node::Location(Location::stored(record))))
        }
        NodeKind::Deck => {
            let id = internal_int(raw, kind)?;
            let deck = Deck::load(pool, DeckId(id))
                .await
                .map_err(internal_error)?
                .ok_or_else(|| user_error("Deck was not found."))?;
            Ok(Some(Node::Deck(deck)))
        }
        NodeKind::DeckCard => {
            let id = internal_int(raw, kind)?;
            let card = DeckCard::load(pool, DeckCardId(id))
                .await
                .map_err(internal_error)?
                .ok_or_else(|| user_error("Deck card was not found."))?;
            Ok(Some(Node::DeckCard(card)))
        }
        NodeKind::TokenItem => {
            let id = internal_int(raw, kind)?;
            match crate::tokens::items::get(pool, id).await {
                Ok(item) => Ok(Some(Node::TokenItem(item))),
                Err(crate::tokens::items::TokenItemError::Db(error)) => Err(internal_error(error)),
                Err(other) => Err(user_error(other.to_string())),
            }
        }
    }
}
