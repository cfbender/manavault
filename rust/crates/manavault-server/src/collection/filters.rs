//! Collection filters and the collection search
//! (`CardCollection.ItemQueries.Base` and `CardCollection.SearchFilter`).
//!
//! Queries join `collection_items AS i`, `scryfall_printings AS p`,
//! `scryfall_cards AS c`, and `locations AS l` (left), so the catalog search
//! predicates over `c`/`p` apply unchanged.

use sqlx::{QueryBuilder, Sqlite};

use crate::catalog::price::price_value_sql as price_value_sql_for;
use crate::catalog::scryfall_query::{self, Expr, Field, Op, Predicate};
use crate::catalog::search::name_match;
use crate::catalog::search::predicates::{
    self, ColorField, TextField, color_count, downcase, parse_float, parse_int, text_field,
};
use crate::catalog::sql::Fragment;

/// The location a listing is scoped to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocationFilter {
    /// Items without a location.
    Unfiled,
    /// Items in one location (any kind, lists included).
    Id(i64),
}

/// Collection filters (`CollectionItemFilters` plus internal options).
///
/// Scoping to a location hides copies allocated to decks and shows list
/// items; otherwise list items are hidden unless `include_list_locations`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ItemFilters {
    /// Scryfall-style search text.
    pub q: String,
    pub condition: String,
    pub language: String,
    pub finish: String,
    pub location: Option<LocationFilter>,
    /// The card (oracle id).
    pub card_id: String,
    pub include_list_locations: bool,
    pub unallocated_only: bool,
    /// Only items with copies offered for trade; totals count offered copies.
    pub for_trade: bool,
    pub added_within_days: Option<i64>,
}

impl ItemFilters {
    /// Filters scoped to a location.
    #[must_use]
    pub fn at(location: LocationFilter) -> Self {
        Self {
            location: Some(location),
            ..Self::default()
        }
    }

    /// Filters for a search term.
    #[must_use]
    pub fn search(q: impl Into<String>) -> Self {
        Self {
            q: q.into(),
            ..Self::default()
        }
    }
}

/// The joined tables every collection query reads.
pub const FROM_SQL: &str = "FROM collection_items AS i \
     JOIN scryfall_printings AS p ON p.scryfall_id = i.scryfall_id \
     JOIN scryfall_cards AS c ON c.oracle_id = p.oracle_id \
     LEFT JOIN locations AS l ON l.id = i.location_id";

/// Items allocated to any deck.
pub const ALLOCATED_SQL: &str =
    "i.id IN (SELECT allocation.collection_item_id FROM deck_allocations AS allocation)";

/// Items outside list locations.
pub const NOT_LIST_SQL: &str = "(l.id IS NULL OR l.kind != 'list')";

/// `SELECT <select> FROM ... WHERE <filters>` (`Base.base_query/1`).
#[must_use]
pub fn base_query(select: &str, filters: &ItemFilters) -> QueryBuilder<Sqlite> {
    let mut builder = QueryBuilder::new(format!("SELECT {select} {FROM_SQL} WHERE TRUE"));
    push_filters(&mut builder, filters);
    builder
}

/// Appends ` AND ...` conditions for the filters.
pub fn push_filters(builder: &mut QueryBuilder<Sqlite>, filters: &ItemFilters) {
    if let Some(search) = search_filter(&filters.q) {
        builder.push(" AND ");
        search.push_to(builder);
    }
    let card_id = filters.card_id.trim();
    if !card_id.is_empty() {
        builder.push(" AND c.oracle_id = ");
        builder.push_bind(card_id.to_owned());
    }
    for (column, value) in [
        ("i.condition", &filters.condition),
        ("i.language", &filters.language),
        ("i.finish", &filters.finish),
    ] {
        let value = value.trim();
        if !value.is_empty() {
            builder.push(format!(" AND {column} = "));
            builder.push_bind(value.to_owned());
        }
    }
    match filters.location {
        Some(LocationFilter::Unfiled) => {
            builder.push(" AND i.location_id IS NULL");
        }
        Some(LocationFilter::Id(id)) => {
            builder.push(" AND i.location_id = ");
            builder.push_bind(id);
        }
        None => {}
    }
    if filters.unallocated_only || filters.location.is_some() {
        builder.push(format!(" AND NOT ({ALLOCATED_SQL})"));
    }
    if filters.for_trade {
        builder.push(" AND i.for_trade_quantity > 0");
    }
    if let Some(days) = filters.added_within_days.filter(|days| *days > 0) {
        let cutoff = time::OffsetDateTime::now_utc() - time::Duration::days(days);
        builder.push(" AND i.inserted_at >= ");
        builder.push_bind(crate::timefmt::utc_seconds(cutoff));
    }
    if filters.location.is_none() && !filters.include_list_locations {
        builder.push(format!(" AND {NOT_LIST_SQL}"));
    }
}

/// The condition for a search term (`SearchFilter.Query.apply/2`): `None`
/// for a blank term, the parsed query's predicates, or a loose text match on
/// the whole term when it does not parse.
#[must_use]
pub fn search_filter(term: &str) -> Option<Fragment> {
    let term = term.trim();
    if term.is_empty() {
        return None;
    }
    match scryfall_query::parse(term) {
        Ok(Expr::And(terms)) if terms.is_empty() => None,
        Ok(expr) => Some(for_expr(&expr)),
        Err(_) => Some(plain_text(term)),
    }
}

fn for_expr(expr: &Expr) -> Fragment {
    match expr {
        Expr::And(terms) => terms
            .iter()
            .fold(Fragment::truth(), |acc, term| acc.and(for_expr(term))),
        Expr::Or(terms) => terms
            .iter()
            .fold(Fragment::falsity(), |acc, term| acc.or(for_expr(term))),
        Expr::Not(inner) => for_expr(inner).negate(),
        Expr::ExactName(name) => {
            let name = name_match::sql_normalize(name);
            Fragment::sql("(c.normalized_name = ")
                .text(name.clone())
                .push(" OR p.normalized_flavor_name = ")
                .text(name)
                .push(")")
        }
        Expr::Predicate(predicate) => for_predicate(predicate),
    }
}

fn for_predicate(predicate: &Predicate) -> Fragment {
    let Predicate {
        field,
        op,
        value,
        regex,
    } = predicate;
    if *regex {
        return Fragment::falsity();
    }
    let op = *op;
    match field {
        Field::Text => plain_text(value),
        Field::Name => text_field(TextField::Name, op, value),
        Field::Type => text_field(TextField::Type, op, value),
        Field::Oracle => text_field(TextField::Oracle, op, value),
        Field::Mana => text_field(TextField::Mana, op, value),
        Field::ManaValue => predicates::mana_value(op, value),
        Field::Colors => predicates::colors(ColorField::Colors, op, value),
        Field::Identity => predicates::colors(ColorField::Identity, op, value),
        Field::Rarity => predicates::rarity(op, value),
        Field::Set => predicates::set(op, value),
        Field::CollectorNumber => predicates::collector_number(op, value),
        Field::Date => predicates::date(op, value),
        Field::Year => predicates::year(op, value),
        Field::Language => language(op, value),
        Field::Quantity => quantity(op, value),
        Field::Usd => price(op, value),
        Field::Paid => purchase_price(op, value),
        Field::Added => added(op, value),
        Field::Is => is_predicate(op, value),
        _ => Fragment::falsity(),
    }
}

fn equality_op(op: Op) -> bool {
    matches!(op, Op::Colon | Op::Eq | Op::Neq)
}

fn negate_if(condition: Fragment, op: Op) -> Fragment {
    if op == Op::Neq {
        condition.negate()
    } else {
        condition
    }
}

/// A loose term: card or flavor name, set code or name, collector number, or
/// Scryfall id (`TextPredicates.plain_text/1`).
#[must_use]
pub fn plain_text(term: &str) -> Fragment {
    let pattern = name_match::substring_pattern(&downcase(term));
    let name_pattern = name_match::like_pattern(term);
    let mut fragment = Fragment::sql("(c.normalized_name LIKE ")
        .text(name_pattern.clone())
        .push(" ESCAPE '\\' OR p.normalized_flavor_name LIKE ")
        .text(name_pattern)
        .push(" ESCAPE '\\'");
    for column in [
        "p.set_code",
        "p.set_name",
        "p.collector_number",
        "p.scryfall_id",
    ] {
        fragment = fragment
            .push(format!(" OR lower({column}) LIKE "))
            .text(pattern.clone())
            .push(" ESCAPE '\\'");
    }
    fragment.push(")")
}

/// `lang:` matches the copy's language.
fn language(op: Op, value: &str) -> Fragment {
    if !equality_op(op) {
        return Fragment::falsity();
    }
    negate_if(
        Fragment::sql("lower(i.language) = ").text(downcase(value)),
        op,
    )
}

/// `quantity:` compares copies in the item.
fn quantity(op: Op, value: &str) -> Fragment {
    match parse_int(value) {
        Some(number) => Fragment::sql(format!("i.quantity {} ", op.sql())).int(number),
        None => Fragment::falsity(),
    }
}

/// `usd:` compares the copy's current price in its finish.
fn price(op: Op, value: &str) -> Fragment {
    match parse_float(value) {
        Some(number) => Fragment::sql(format!("{} {} ", price_value_sql(), op.sql())).real(number),
        None => Fragment::falsity(),
    }
}

/// `paid:` compares the per-copy purchase price, given in dollars. Copies
/// without a recorded purchase price never match.
fn purchase_price(op: Op, value: &str) -> Fragment {
    match parse_float(value.trim_start_matches('$')) {
        Some(dollars) => {
            let cents = (dollars * 100.0).round();
            Fragment::sql(format!("i.purchase_price_cents {} ", op.sql())).real(cents)
        }
        None => Fragment::falsity(),
    }
}

/// `added:` compares the UTC day a copy was added, so `added<=2026-09-01`
/// includes everything added that day.
fn added(op: Op, value: &str) -> Fragment {
    let Ok(date) = time::Date::parse(
        value,
        time::macros::format_description!("[year]-[month]-[day]"),
    ) else {
        return Fragment::falsity();
    };
    let Some(next) = date.next_day() else {
        return Fragment::falsity();
    };
    let start = crate::timefmt::utc_seconds(date.midnight().assume_utc());
    let end = crate::timefmt::utc_seconds(next.midnight().assume_utc());
    match op.comparison() {
        Op::Neq => Fragment::sql("(i.inserted_at < ")
            .text(start)
            .push(" OR i.inserted_at >= ")
            .text(end)
            .push(")"),
        Op::Gt => Fragment::sql("i.inserted_at >= ").text(end),
        Op::Gte => Fragment::sql("i.inserted_at >= ").text(start),
        Op::Lt => Fragment::sql("i.inserted_at < ").text(start),
        Op::Lte => Fragment::sql("i.inserted_at < ").text(end),
        Op::Colon | Op::Eq => Fragment::sql("(i.inserted_at >= ")
            .text(start)
            .push(" AND i.inserted_at < ")
            .text(end)
            .push(")"),
    }
}

fn permanent() -> Fragment {
    [
        "artifact",
        "creature",
        "enchantment",
        "land",
        "planeswalker",
        "battle",
    ]
    .into_iter()
    .fold(Fragment::falsity(), |acc, word| {
        acc.or(text_field(TextField::Type, Op::Colon, word))
    })
}

/// `is:`/`not:` flags of a copy (`ScalarPredicates.is_predicate/2`).
fn is_predicate(op: Op, value: &str) -> Fragment {
    if !equality_op(op) {
        return Fragment::falsity();
    }
    let condition = match downcase(value).as_str() {
        finish @ ("foil" | "nonfoil" | "etched") => {
            Fragment::sql("i.finish = ").text(finish.to_owned())
        }
        "allocated" => Fragment::sql(ALLOCATED_SQL),
        "unallocated" => Fragment::sql(ALLOCATED_SQL).negate(),
        "paid" => Fragment::sql("i.purchase_price_cents IS NOT NULL"),
        "unpaid" => Fragment::sql("i.purchase_price_cents IS NULL"),
        "colorless" => color_count(ColorField::Colors, Op::Eq, 0, Op::Eq),
        "multicolor" => color_count(ColorField::Colors, Op::Gte, 2, Op::Gte),
        word @ ("land" | "creature" | "artifact" | "enchantment" | "planeswalker" | "instant"
        | "sorcery") => text_field(TextField::Type, Op::Colon, word),
        "permanent" => permanent(),
        "spell" => Fragment::sql("NOT (lower(coalesce(c.type_line, '')) LIKE '%land%')"),
        _ => Fragment::falsity(),
    };
    negate_if(condition, op)
}

/// Sortable fields (`normalize_sort_field/1`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SortField {
    #[default]
    Name,
    Quantity,
    Set,
    Rarity,
    Price,
    ValueGain,
    Added,
}

/// A normalized sort: unknown fields sort by name, unknown directions ascend.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Sort {
    pub field: SortField,
    pub descending: bool,
}

const RARITY_SQL: &str = "CASE p.rarity WHEN 'common' THEN 1 WHEN 'uncommon' THEN 2 WHEN 'rare' THEN 3 WHEN 'mythic' THEN 4 ELSE 0 END";

impl Sort {
    /// `normalize_sort/1` for the GraphQL `CollectionItemSort` input.
    #[must_use]
    pub fn parse(field: Option<&str>, direction: Option<&str>) -> Self {
        let field = match field.map(|f| f.trim().to_lowercase()).as_deref() {
            Some("quantity") => SortField::Quantity,
            Some("set") => SortField::Set,
            Some("rarity") => SortField::Rarity,
            Some("price") => SortField::Price,
            Some("value_gain") => SortField::ValueGain,
            Some("added") => SortField::Added,
            _ => SortField::Name,
        };
        let descending = direction.map(|d| d.trim().to_lowercase()).as_deref() == Some("desc");
        Self { field, descending }
    }

    fn dir(self) -> &'static str {
        if self.descending { "DESC" } else { "ASC" }
    }

    /// `ORDER BY` for item listings (`apply_sort/2`).
    #[must_use]
    pub fn items_order(self) -> String {
        let dir = self.dir();
        let price = price_value_sql();
        let gain = value_gain_sql();
        match self.field {
            SortField::Quantity => format!(
                "i.quantity {dir}, c.name ASC, p.set_code ASC, p.collector_number ASC, i.id ASC"
            ),
            SortField::Set => format!(
                "p.set_name {dir}, p.set_code {dir}, c.name ASC, p.collector_number ASC, i.id ASC"
            ),
            SortField::Rarity => format!("{RARITY_SQL} {dir}, c.name ASC, i.id ASC"),
            SortField::Price => format!("{price} {dir}, c.name ASC, i.id ASC"),
            SortField::ValueGain => format!("{gain} {dir}, c.name ASC, i.id ASC"),
            SortField::Added => format!(
                "i.inserted_at {dir}, c.name ASC, p.set_code ASC, p.collector_number ASC, i.id ASC"
            ),
            SortField::Name => {
                format!("c.name {dir}, p.set_code ASC, p.collector_number ASC, i.id ASC")
            }
        }
    }

    /// `ORDER BY` for printing groups (`apply_group_sort/2`).
    #[must_use]
    pub fn groups_order(self) -> String {
        let dir = self.dir();
        let price = price_value_sql();
        let gain = value_gain_sql();
        match self.field {
            SortField::Quantity => {
                format!("sum(i.quantity) {dir}, c.name ASC, i.scryfall_id ASC")
            }
            SortField::Set => format!(
                "p.set_name {dir}, p.set_code {dir}, c.name ASC, p.collector_number ASC, i.scryfall_id ASC"
            ),
            SortField::Rarity => format!("{RARITY_SQL} {dir}, c.name ASC, i.scryfall_id ASC"),
            SortField::Price => format!("max({price}) {dir}, c.name ASC, i.scryfall_id ASC"),
            // Bug in earlier releases (not kept): `item.quantity *
            // value_gain_cents_fragment(...)` splices the fragment
            // `price - COALESCE(purchase, price)` unparenthesized, so it
            // sorted by `sum(quantity * price - COALESCE(purchase, price))`:
            // a 5-copy group with no purchase price (gain 0) sorted as a
            // gain of four copies' value. The gain is parenthesized here.
            SortField::ValueGain => {
                format!("sum(i.quantity * ({gain})) {dir}, c.name ASC, i.scryfall_id ASC")
            }
            SortField::Added if self.descending => {
                "max(i.inserted_at) DESC, c.name ASC, i.scryfall_id ASC".to_owned()
            }
            SortField::Added => "min(i.inserted_at) ASC, c.name ASC, i.scryfall_id ASC".to_owned(),
            SortField::Name => {
                format!("c.name {dir}, p.set_code ASC, p.collector_number ASC, i.scryfall_id ASC")
            }
        }
    }
}

/// Finish-aware current price (REAL) of a copy (`price_value_fragment/2`).
#[must_use]
pub fn price_value_sql() -> String {
    price_value_sql_for("p", "i.finish")
}

/// Finish-aware current price of a copy in integer cents.
#[must_use]
pub fn price_cents_sql() -> String {
    format!("CAST(round({} * 100) AS INTEGER)", price_value_sql())
}

/// Current minus purchase price of a copy, in cents
/// (`value_gain_cents_fragment/2`).
#[must_use]
pub fn value_gain_sql() -> String {
    let price = price_cents_sql();
    format!("{price} - COALESCE(i.purchase_price_cents, {price})")
}
