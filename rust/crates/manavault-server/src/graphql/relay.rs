//! Relay global ids and connections, compatible with `Absinthe.Relay`.
//!
//! Global ids are `base64("Type:id")` and cursors `base64("arrayconnection:N")`,
//! so ids and cursors the frontend cached against earlier releases keep
//! working. Error messages match `ManavaultWeb.Schema.RelayHelpers`.

use async_graphql::{ID, SimpleObject};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;

/// Object types that implement `Node`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeKind {
    Card,
    Printing,
    CollectionItem,
    Location,
    Deck,
    DeckCard,
    TokenItem,
}

impl NodeKind {
    /// The GraphQL type name used in global ids.
    #[must_use]
    pub fn type_name(self) -> &'static str {
        match self {
            Self::Card => "Card",
            Self::Printing => "Printing",
            Self::CollectionItem => "CollectionItem",
            Self::Location => "Location",
            Self::Deck => "Deck",
            Self::DeckCard => "DeckCard",
            Self::TokenItem => "TokenItem",
        }
    }

    /// The lower-case label used in error messages ("deck card").
    #[must_use]
    pub fn label(self) -> &'static str {
        match self {
            Self::Card => "card",
            Self::Printing => "printing",
            Self::CollectionItem => "collection item",
            Self::Location => "location",
            Self::Deck => "deck",
            Self::DeckCard => "deck card",
            Self::TokenItem => "token item",
        }
    }

    /// The node kind a global id's type name names.
    #[must_use]
    pub fn from_type_name(name: &str) -> Option<Self> {
        [
            Self::Card,
            Self::Printing,
            Self::CollectionItem,
            Self::Location,
            Self::Deck,
            Self::DeckCard,
            Self::TokenItem,
        ]
        .into_iter()
        .find(|kind| kind.type_name() == name)
    }
}

/// `Absinthe.Relay.Node.to_global_id/2`.
#[must_use]
pub fn global_id(kind: NodeKind, id: impl std::fmt::Display) -> ID {
    ID(STANDARD.encode(format!("{}:{id}", kind.type_name())))
}

/// `Absinthe.Relay.Node.IDTranslator.Base64.from_global_id/2`: the type
/// name and raw id of a global id, whatever the type.
pub fn decode_global_id(id: &str) -> Result<(String, String), String> {
    let decoded = STANDARD
        .decode(id)
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .ok_or_else(|| format!("Could not decode ID value `{id}'"))?;
    match decoded.split_once(':') {
        Some((type_name, raw)) if !type_name.is_empty() && !raw.is_empty() => {
            Ok((type_name.to_owned(), raw.to_owned()))
        }
        _ => Err(format!(
            "Could not extract value from decoded ID `{decoded:?}`"
        )),
    }
}

/// `Absinthe.Relay.Node.from_global_id/2`: the node kind and raw id.
pub fn from_global_id(id: &str) -> Result<(NodeKind, String), String> {
    let (type_name, raw) = decode_global_id(id)?;
    let kind = NodeKind::from_type_name(&type_name)
        .ok_or_else(|| format!("Unknown type `{type_name}'"))?;
    Ok((kind, raw))
}

fn expect_kind(id: &str, expected: NodeKind) -> Result<String, String> {
    let (kind, raw) = from_global_id(id).map_err(|message| {
        if message.starts_with("Expected ") {
            message
        } else {
            format!("Invalid {} ID: {message}", expected.label())
        }
    })?;
    if kind == expected {
        Ok(raw)
    } else {
        Err(format!(
            "Expected {} ID, got {} ID",
            expected.label(),
            kind.label()
        ))
    }
}

fn parse_int(raw: &str, kind: NodeKind) -> Result<i64, String> {
    raw.parse()
        .map_err(|_| format!("Invalid internal {} ID", kind.label()))
}

/// Decodes a global id of an integer-keyed node (`RelayHelpers.node_id/3`).
pub fn node_int(id: &ID, kind: NodeKind) -> async_graphql::Result<i64> {
    let raw = expect_kind(id.as_str(), kind)?;
    Ok(parse_int(&raw, kind)?)
}

/// Decodes a global id of a string-keyed node (cards and printings).
pub fn node_str(id: &ID, kind: NodeKind) -> async_graphql::Result<String> {
    Ok(expect_kind(id.as_str(), kind)?)
}

/// Like [`node_int`], treating `null` and `""` as absent.
pub fn optional_node_int(id: Option<&ID>, kind: NodeKind) -> async_graphql::Result<Option<i64>> {
    match id {
        None => Ok(None),
        Some(id) if id.is_empty() => Ok(None),
        Some(id) => node_int(id, kind).map(Some),
    }
}

/// Decodes many integer ids, failing on the first bad one.
pub fn node_ints(ids: &[ID], kind: NodeKind) -> async_graphql::Result<Vec<i64>> {
    ids.iter().map(|id| node_int(id, kind)).collect()
}

/// A location reference: a stored location, or the virtual "unfiled" bucket.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocationRef {
    Unfiled,
    Id(i64),
}

/// Decodes a location id; `"unfiled"` (raw or global) is the unfiled bucket.
pub fn location_ref(id: &ID) -> async_graphql::Result<LocationRef> {
    let raw = expect_kind(id.as_str(), NodeKind::Location)?;
    if raw == "unfiled" {
        return Ok(LocationRef::Unfiled);
    }
    Ok(LocationRef::Id(parse_int(&raw, NodeKind::Location)?))
}

/// `RelayHelpers.node_id/3` inside the `node(id:)` field, on the internal
/// id the global id decoded to: a nested global id of `kind` is unwrapped
/// (another kind is an error), and anything that does not decode is used
/// as is.
pub fn node_field_id(raw: &str, kind: NodeKind) -> Result<String, String> {
    match from_global_id(raw) {
        Ok((found, inner)) if found == kind => Ok(inner),
        Ok((found, _)) => Err(format!(
            "Expected {} ID, got {} ID",
            kind.label(),
            found.label()
        )),
        Err(_) => Ok(raw.to_owned()),
    }
}

/// An integer node id (`coerce_node_id/2`): "Invalid internal … ID".
pub fn parse_internal_id(raw: &str, kind: NodeKind) -> Result<i64, String> {
    parse_int(raw, kind)
}

const CURSOR_PREFIX: &str = "arrayconnection:";

/// `Absinthe.Relay.Connection.offset_to_cursor/1`.
#[must_use]
pub fn offset_to_cursor(offset: usize) -> String {
    STANDARD.encode(format!("{CURSOR_PREFIX}{offset}"))
}

/// `Absinthe.Relay.Connection.cursor_to_offset/1`.
#[must_use]
pub fn cursor_to_offset(cursor: &str) -> Option<i64> {
    let decoded = String::from_utf8(STANDARD.decode(cursor).ok()?).ok()?;
    let raw = decoded.strip_prefix(CURSOR_PREFIX)?;
    let digits: String = raw
        .chars()
        .enumerate()
        .take_while(|(index, c)| c.is_ascii_digit() || (*index == 0 && (*c == '-' || *c == '+')))
        .map(|(_, c)| c)
        .collect();
    digits.parse().ok()
}

/// Relay pagination arguments.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PageArgs {
    pub after: Option<String>,
    pub first: Option<i64>,
    pub before: Option<String>,
    pub last: Option<i64>,
}

impl PageArgs {
    #[must_use]
    pub fn new(
        after: Option<String>,
        first: Option<i32>,
        before: Option<String>,
        last: Option<i32>,
    ) -> Self {
        Self {
            after,
            first: first.map(i64::from),
            before,
            last: last.map(i64::from),
        }
    }

    /// Whether any relay argument was given.
    #[must_use]
    pub fn is_relay(&self) -> bool {
        self.after.is_some() || self.first.is_some() || self.before.is_some() || self.last.is_some()
    }

    /// Fills `first` with `default` when neither `first` nor `last` was given
    /// (`RelayHelpers.connection_args/2`).
    #[must_use]
    pub fn with_default_first(mut self, default: i64) -> Self {
        if self.first.is_none() && self.last.is_none() {
            self.first = Some(default);
        }
        self
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Direction {
    Forward,
    Backward,
}

fn limit(args: &PageArgs) -> Result<(Direction, i64), String> {
    match (args.first, args.last) {
        (Some(first), _) => Ok((Direction::Forward, first)),
        (None, Some(last)) => Ok((Direction::Backward, last)),
        (None, None) => Err("You must either supply `:first` or `:last`".to_owned()),
    }
}

fn offset(args: &PageArgs) -> Result<Option<i64>, String> {
    if let Some(after) = &args.after {
        return cursor_to_offset(after)
            .map(|offset| Some(offset + 1))
            .ok_or_else(|| "Invalid cursor provided as `after` argument".to_owned());
    }
    if let Some(before) = &args.before {
        return cursor_to_offset(before)
            .map(|offset| Some(offset.max(0)))
            .ok_or_else(|| "Invalid cursor provided as `before` argument".to_owned());
    }
    Ok(None)
}

/// `Connection.offset_and_limit_for_query/2` with a known total count.
pub fn offset_and_limit(args: &PageArgs, count: i64) -> async_graphql::Result<(i64, i64)> {
    let (direction, limit) = limit(args)?;
    let offset = offset(args)?;
    Ok(match direction {
        Direction::Forward => (offset.unwrap_or(0), limit),
        Direction::Backward => match offset {
            None => ((count - limit).max(0), limit),
            Some(value) => {
                let start = (value - limit).max(0);
                (start, if start == 0 { value } else { limit })
            }
        },
    })
}

/// `RelayHelpers.offset_and_limit/2`: forward-only window with a default page size.
pub fn forward_window(args: &PageArgs, default_limit: i64) -> async_graphql::Result<(i64, i64)> {
    let args = args.clone().with_default_first(default_limit);
    let (_, limit) = limit(&args)?;
    Ok((offset(&args)?.unwrap_or(0), limit))
}

/// `Relay.Connection.PageInfo`.
#[derive(Debug, Clone, Default, PartialEq, Eq, SimpleObject)]
pub struct PageInfo {
    /// When paginating backwards, are there more items?
    pub has_previous_page: bool,
    /// When paginating forwards, are there more items?
    pub has_next_page: bool,
    /// When paginating backwards, the cursor to continue.
    pub start_cursor: Option<String>,
    /// When paginating forwards, the cursor to continue.
    pub end_cursor: Option<String>,
}

/// A page of nodes with their cursors, before wrapping in a GraphQL type.
#[derive(Debug, Clone)]
pub struct Page<T> {
    pub page_info: PageInfo,
    pub edges: Vec<(String, T)>,
}

/// `Connection.from_slice/3`.
#[must_use]
pub fn from_slice<T>(items: Vec<T>, offset: i64, has_previous: bool, has_next: bool) -> Page<T> {
    let start = usize::try_from(offset.max(0)).unwrap_or(0);
    let edges: Vec<(String, T)> = items
        .into_iter()
        .enumerate()
        .map(|(index, item)| (offset_to_cursor(start + index), item))
        .collect();
    Page {
        page_info: PageInfo {
            has_previous_page: has_previous,
            has_next_page: has_next,
            start_cursor: edges.first().map(|(cursor, _)| cursor.clone()),
            end_cursor: edges.last().map(|(cursor, _)| cursor.clone()),
        },
        edges,
    }
}

/// `Connection.from_list/2`: paginates an in-memory list.
pub fn from_list<T>(items: Vec<T>, args: &PageArgs) -> async_graphql::Result<Page<T>> {
    let (direction, limit) = limit(args)?;
    let offset = offset(args)?;
    let count = i64::try_from(items.len()).unwrap_or(i64::MAX);
    let (offset, limit) = match direction {
        Direction::Forward => (offset.unwrap_or(0), limit),
        Direction::Backward => {
            let end = offset.unwrap_or(count);
            let start = (end - limit).max(0);
            (start, if start == 0 { end } else { limit })
        }
    };
    let has_previous = offset > 0;
    let has_next = count > offset + limit;
    let skip = usize::try_from(offset.max(0)).unwrap_or(usize::MAX);
    let take = usize::try_from(limit.max(0)).unwrap_or(0);
    let slice: Vec<T> = items.into_iter().skip(skip).take(take).collect();
    Ok(from_slice(slice, offset, has_previous, has_next))
}

/// `RelayHelpers.connection_from_list/3`: like [`from_list`] with a default
/// page size (all items when `None`).
pub fn connection_from_list<T>(
    items: Vec<T>,
    args: &PageArgs,
    default_limit: Option<i64>,
) -> async_graphql::Result<Page<T>> {
    let default = default_limit.unwrap_or_else(|| i64::try_from(items.len()).unwrap_or(i64::MAX));
    from_list(items, &args.clone().with_default_first(default))
}

/// Defines `XConnection` and `XEdge` GraphQL types for a node type, with
/// Absinthe's nullability (`edges: [XEdge]`, `node: X`, `cursor: String`).
#[macro_export]
macro_rules! connection_types {
    ($connection:ident, $edge:ident, $node:ty) => {
        #[derive(Clone)]
        pub struct $edge {
            pub node: $node,
            pub cursor: String,
        }

        #[async_graphql::Object]
        impl $edge {
            async fn node(&self) -> Option<&$node> {
                Some(&self.node)
            }

            async fn cursor(&self) -> Option<&str> {
                Some(&self.cursor)
            }
        }

        #[derive(Clone)]
        pub struct $connection {
            pub page_info: $crate::graphql::relay::PageInfo,
            pub edges: Vec<$edge>,
        }

        #[async_graphql::Object]
        impl $connection {
            async fn page_info(&self) -> &$crate::graphql::relay::PageInfo {
                &self.page_info
            }

            async fn edges(&self) -> Option<Vec<Option<&$edge>>> {
                Some(self.edges.iter().map(Some).collect())
            }
        }

        impl From<$crate::graphql::relay::Page<$node>> for $connection {
            fn from(page: $crate::graphql::relay::Page<$node>) -> Self {
                Self {
                    page_info: page.page_info,
                    edges: page
                        .edges
                        .into_iter()
                        .map(|(cursor, node)| $edge { node, cursor })
                        .collect(),
                }
            }
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn global_ids_match_absinthe() {
        assert_eq!(global_id(NodeKind::Deck, 12).as_str(), "RGVjazoxMg==");
        assert_eq!(
            node_int(&ID("RGVjazoxMg==".into()), NodeKind::Deck).unwrap(),
            12
        );
        let error = node_int(&ID("RGVjazoxMg==".into()), NodeKind::DeckCard).unwrap_err();
        assert_eq!(error.message, "Expected deck card ID, got deck ID");
        let error = node_int(&ID("nope!".into()), NodeKind::Deck).unwrap_err();
        assert_eq!(
            error.message,
            "Invalid deck ID: Could not decode ID value `nope!'"
        );
        assert_eq!(
            location_ref(&global_id(NodeKind::Location, "unfiled")).unwrap(),
            LocationRef::Unfiled
        );
    }

    #[test]
    fn cursors_and_pagination_match_absinthe() {
        assert_eq!(offset_to_cursor(0), "YXJyYXljb25uZWN0aW9uOjA=");
        assert_eq!(cursor_to_offset("YXJyYXljb25uZWN0aW9uOjA="), Some(0));
        let args = PageArgs {
            first: Some(2),
            after: Some(offset_to_cursor(0)),
            ..PageArgs::default()
        };
        let page = from_list(vec![1, 2, 3, 4], &args).unwrap();
        let nodes: Vec<i32> = page.edges.iter().map(|(_, n)| *n).collect();
        assert_eq!(nodes, vec![2, 3]);
        assert!(page.page_info.has_previous_page);
        assert!(page.page_info.has_next_page);
        let last = PageArgs {
            last: Some(3),
            ..PageArgs::default()
        };
        let page = from_list(vec![1, 2, 3, 4], &last).unwrap();
        assert_eq!(page.edges.len(), 3);
        assert_eq!(offset_and_limit(&last, 4).unwrap(), (1, 3));
        assert!(from_list(vec![1], &PageArgs::default()).is_err());
    }
}
