//! `is:`, `not:`, and `has:` flags over cards aliased `c` and printings
//! aliased `p`.

use crate::catalog::scryfall_query::Op;
use crate::catalog::search::flags;
use crate::catalog::sql::Fragment;

use super::history::{self, json_contains};
use super::{
    ColorField, TextField, color_count, downcase, equality_op, negate_if, permanent, text_field,
};

/// A card counts as allocated when any collection copy of it is allocated
/// to a deck.
fn allocated_to_deck() -> Fragment {
    Fragment::sql(
        "c.oracle_id IN (SELECT allocated_printing.oracle_id FROM deck_allocations AS allocation \
         JOIN collection_items AS allocated_item ON allocated_item.id = allocation.collection_item_id \
         JOIN scryfall_printings AS allocated_printing ON allocated_printing.scryfall_id = allocated_item.scryfall_id)",
    )
}

fn layout(layouts: &[&str]) -> Fragment {
    let list = layouts
        .iter()
        .map(|layout| format!("'{layout}'"))
        .collect::<Vec<_>>()
        .join(", ");
    Fragment::sql(format!("coalesce(c.layout, '') IN ({list})"))
}

/// Frame effects that make a printing's frame atypical.
const ATYPICAL_FRAME_EFFECTS: [&str; 6] = [
    "showcase",
    "extendedart",
    "inverted",
    "etched",
    "fullart",
    "shatteredglass",
];

fn atypical() -> Fragment {
    ATYPICAL_FRAME_EFFECTS.iter().fold(
        Fragment::sql("(p.border_color = 'borderless' OR p.full_art)"),
        |acc, effect| acc.or(json_contains("p.frame_effects", effect)),
    )
}

/// `is:`/`not:` flags. Unknown values match a promo type or frame effect of
/// that name (`is:prerelease`, `is:buy_a_box`, `is:showcase`).
#[must_use]
pub fn is_predicate(op: Op, value: &str) -> Fragment {
    if !equality_op(op) {
        return Fragment::falsity();
    }
    let value = downcase(value).replace(['_', '-', ' '], "");
    let condition = match value.as_str() {
        finish @ ("foil" | "nonfoil" | "etched" | "glossy") => json_contains("p.finishes", finish),
        "allocated" => allocated_to_deck(),
        "unallocated" => allocated_to_deck().negate(),
        "colorless" => color_count(ColorField::Colors, Op::Eq, 0, Op::Eq),
        "multicolor" | "multicolored" => color_count(ColorField::Colors, Op::Gte, 2, Op::Gte),
        "monocolor" | "monocolored" => color_count(ColorField::Colors, Op::Eq, 1, Op::Eq),
        word @ ("land" | "creature" | "artifact" | "enchantment" | "planeswalker" | "instant"
        | "sorcery" | "battle" | "legendary" | "tribal" | "kindred" | "snow" | "basic") => {
            text_field(TextField::Type, Op::Colon, word)
        }
        "permanent" => permanent(),
        // Cast as a spell: the front face is not a land.
        "spell" => Fragment::sql(
            "NOT (lower(substr(coalesce(c.type_line, ''), 1, \
             instr(coalesce(c.type_line, '') || ' // ', ' // ') - 1)) LIKE '%land%')",
        ),
        "vanilla" => text_field(TextField::Type, Op::Colon, "creature")
            .and(Fragment::sql("coalesce(c.oracle_text, '') = ''")),
        "split" => layout(&["split"]),
        "flip" => layout(&["flip"]),
        "transform" | "tdfc" => layout(&["transform"]),
        "meld" => layout(&["meld"]),
        "leveler" => layout(&["leveler"]),
        "mdfc" => layout(&["modal_dfc"]),
        "dfc" => layout(&[
            "transform",
            "modal_dfc",
            "meld",
            "double_faced_token",
            "reversible_card",
        ]),
        "adventure" | "saga" | "class" | "case" | "prototype" | "mutate" | "flipcard" => {
            layout(&[value.as_str()])
        }
        "reserved" => Fragment::sql("c.reserved"),
        "gamechanger" => Fragment::sql("c.game_changer"),
        "promo" => Fragment::sql("p.promo"),
        "reprint" => Fragment::sql("p.reprint"),
        "booster" => Fragment::sql("p.booster"),
        "spotlight" | "storyspotlight" => Fragment::sql("p.story_spotlight"),
        "hires" | "highres" => Fragment::sql("p.highres_image"),
        "full" | "fullart" => Fragment::sql("p.full_art"),
        "new" => Fragment::sql("p.frame = '2015'"),
        "old" => Fragment::sql("p.frame IN ('1993', '1997')"),
        "future" => Fragment::sql("p.frame = 'future'"),
        "masterpiece" => Fragment::sql("p.set_type = 'masterpiece'"),
        "funny" => Fragment::sql("(p.set_type = 'funny' OR p.security_stamp = 'acorn')"),
        "alchemy" => Fragment::sql("p.set_type = 'alchemy'"),
        "universesbeyond" | "ub" => Fragment::sql("p.security_stamp = 'triangle'"),
        "atypical" => atypical(),
        "default" => atypical().negate(),
        "unique" => history::count(history::Count::Sets, Op::Eq, "1"),
        // The catalog stores paper printings only.
        "digital" | "scryfallpreview" => Fragment::falsity(),
        other => {
            let flag = flags::canonical(other);
            if flags::FLAGS.contains(&flag) {
                json_contains("c.search_flags", flag)
            } else {
                json_contains("p.promo_types", other).or(json_contains("p.frame_effects", other))
            }
        }
    };
    negate_if(condition, op)
}

/// `has:watermark`, `has:indicator`, `has:flavor`.
#[must_use]
pub fn has_predicate(op: Op, value: &str) -> Fragment {
    if !equality_op(op) {
        return Fragment::falsity();
    }
    let condition = match downcase(value).as_str() {
        "watermark" | "wm" => Fragment::sql("coalesce(p.watermark, '') != ''"),
        "indicator" | "colorindicator" => json_contains("c.search_flags", "indicator"),
        "flavor" | "flavortext" | "ft" => Fragment::sql("coalesce(p.flavor_text, '') != ''"),
        "artist" => Fragment::sql("coalesce(p.artist, '') != ''"),
        "stamp" | "securitystamp" => Fragment::sql("coalesce(p.security_stamp, '') != ''"),
        _ => Fragment::falsity(),
    };
    negate_if(condition, op)
}
