//! Public share GraphQL fields: `public_wants_share_test.exs`,
//! `public_binder_share_test.exs`, the public parts of
//! `deck_detail_and_share_test.exs`, and the frontend contract of
//! `public_share_cache_test.exs`.

use serde_json::{Value, json};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use super::{T, add_card, insert_deck, public, public_data, share};
use crate::test_support::{TestApp, fixtures};
use crate::trade::share::ShareKind;

async fn app_with_cards() -> TestApp {
    let app = TestApp::new().await;
    app.import_cards(&[
        fixtures::black_lotus(),
        fixtures::black_lotus_beta(),
        fixtures::time_walk(),
    ])
    .await;
    app
}

const WANTS: &str = "query WantsList($id: ID!) { wantsList(id: $id) { entries {
  cardName quantity typeLine setCode collectorNumber imageUrl } } }";

const BINDER: &str = "query BinderList($id: ID!) { binderList(id: $id) { entries {
  cardName quantity typeLine setCode collectorNumber imageUrl finish condition } } }";

fn entry<'a>(entries: &'a Value, name: &str) -> &'a Value {
    entries
        .as_array()
        .unwrap()
        .iter()
        .find(|entry| entry["cardName"] == name)
        .unwrap()
}

#[tokio::test]
async fn wants_list_resolves_the_current_token_only() {
    let app = app_with_cards().await;
    let pool = app.db();
    crate::trade::want::create_by_name(pool, "Time Walk", Some(3))
        .await
        .unwrap();
    crate::trade::want::create_by_printing(pool, "scryfall-printing-3", Some(1))
        .await
        .unwrap();
    let token = crate::trade::share::ensure_token(pool, ShareKind::Wants)
        .await
        .unwrap();
    let data = public_data(&app, WANTS, json!({"id": token})).await;
    let entries = &data["wantsList"]["entries"];
    assert_eq!(entries.as_array().unwrap().len(), 2);
    assert_eq!(
        entry(entries, "Time Walk"),
        &json!({"cardName": "Time Walk", "quantity": 3, "typeLine": "Sorcery",
                "setCode": null, "collectorNumber": null, "imageUrl": null})
    );
    assert_eq!(
        entry(entries, "Black Lotus"),
        &json!({"cardName": "Black Lotus", "quantity": 1, "typeLine": "Artifact",
                "setCode": "leb", "collectorNumber": "233",
                "imageUrl": "https://example.test/black-lotus.jpg"})
    );
    let rotated = crate::trade::share::rotate(pool, ShareKind::Wants)
        .await
        .unwrap();
    let old = public_data(&app, WANTS, json!({"id": token})).await;
    assert_eq!(old, json!({"wantsList": null}));
    let new = public_data(&app, WANTS, json!({"id": rotated})).await;
    assert_eq!(new["wantsList"]["entries"].as_array().unwrap().len(), 2);
    let wrong = public_data(&app, WANTS, json!({"id": "not-a-real-token"})).await;
    assert_eq!(wrong, json!({"wantsList": null}));
}

#[tokio::test]
async fn wants_and_binder_lists_are_null_before_any_share_exists() {
    let app = TestApp::new().await;
    let token = "A".repeat(24);
    assert_eq!(
        public_data(&app, WANTS, json!({"id": token})).await,
        json!({"wantsList": null})
    );
    assert_eq!(
        public_data(&app, BINDER, json!({"id": "not-a-real-token"})).await,
        json!({"binderList": null})
    );
}

async fn insert_item(
    app: &TestApp,
    scryfall_id: &str,
    quantity: i64,
    finish: &str,
    condition: &str,
) {
    sqlx::query(
        "INSERT INTO collection_items (scryfall_id, quantity, for_trade, for_trade_quantity,
           finish, condition, inserted_at, updated_at)
         VALUES (?1, ?2, 1, ?2, ?3, ?4, ?5, ?5)",
    )
    .bind(scryfall_id)
    .bind(quantity)
    .bind(finish)
    .bind(condition)
    .bind(T)
    .execute(app.db())
    .await
    .unwrap();
}

#[tokio::test]
async fn binder_list_resolves_the_current_token_only() {
    let app = app_with_cards().await;
    insert_item(&app, "scryfall-printing-1", 2, "nonfoil", "near_mint").await;
    insert_item(&app, "scryfall-printing-2", 1, "foil", "lightly_played").await;
    let token = crate::trade::share::ensure_token(app.db(), ShareKind::Binder)
        .await
        .unwrap();
    let data = public_data(&app, BINDER, json!({"id": token})).await;
    let entries = &data["binderList"]["entries"];
    assert_eq!(entries.as_array().unwrap().len(), 2);
    assert_eq!(
        entry(entries, "Black Lotus"),
        &json!({"cardName": "Black Lotus", "quantity": 2, "typeLine": "Artifact",
                "setCode": "lea", "collectorNumber": "232",
                "imageUrl": "https://example.test/black-lotus.jpg",
                "finish": "nonfoil", "condition": "near_mint"})
    );
    assert_eq!(
        entry(entries, "Time Walk"),
        &json!({"cardName": "Time Walk", "quantity": 1, "typeLine": "Sorcery",
                "setCode": "lea", "collectorNumber": "84", "imageUrl": null,
                "finish": "foil", "condition": "lightly_played"})
    );
    let rotated = crate::trade::share::rotate(app.db(), ShareKind::Binder)
        .await
        .unwrap();
    assert_eq!(
        public_data(&app, BINDER, json!({"id": token})).await,
        json!({"binderList": null})
    );
    assert_eq!(
        public_data(&app, BINDER, json!({"id": rotated})).await["binderList"]["entries"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
}

/// The frontend's `DeckDocument`, as the share page sends it.
fn frontend_deck_document() -> String {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../assets/react/src/pages/decks/deck-detail-documents.ts");
    let source = std::fs::read_to_string(path).unwrap();
    let pattern = regex::Regex::new(r"(?s)export const DeckDocument = graphql\(`(.*?)`\)").unwrap();
    pattern.captures(&source).unwrap()[1].to_owned()
}

// public_share_cache_test.exs: "frontend deck query stays compatible with
// the public share endpoint"
#[tokio::test]
async fn the_frontend_deck_document_runs_against_the_public_schema() {
    let app = TestApp::new().await;
    let deck = insert_deck(&app, "Frontend Contract Deck", "commander", "brewing").await;
    let token = share(&app, deck).await;
    let response = public(&app, &frontend_deck_document(), json!({"id": token})).await;
    assert!(response.get("errors").is_none(), "{response}");
    assert_eq!(response["data"]["deck"]["name"], "Frontend Contract Deck");
    assert_eq!(response["data"]["deck"]["coverDeckCardId"], Value::Null);
    assert_eq!(response["data"]["deck"]["coverImageUrl"], Value::Null);
}

const SHARED_DECK: &str = r#"
query SharedDeck($id: ID!, $deckCardsAfter: String) {
  deck(id: $id) {
    id name format status primer aiAnalysis aiAnalysisModel aiAnalyzedAt
    commanderBracket commanderBracketEstimate commanderBracketRating shareToken
    cardCount uniqueCardCount
    legality { status issues { code message severity cardName } }
    tags { id name color targetCount position cardCount }
    deckCards(first: 500, after: $deckCardsAfter) {
      pageInfo { endCursor hasNextPage }
      edges { node {
        id quantity zone finish tag tagIds priceCents
        card { id oracleId name typeLine cmc manaCost oracleText colors colorIdentity
               gameChanger edhrecCommanderRank edhrecSaltiness deckCategory deckThemes }
        preferredPrinting { id scryfallId imageUrl backImageUrl artCropUrl setCode setName
                            collectorNumber rarity finishes }
        fallbackPrinting { id scryfallId imageUrl backImageUrl artCropUrl setCode setName
                           collectorNumber rarity finishes }
        allocationStatus {
          state required owned allocated proxyAllocated available allocatedElsewhere missing
          candidates { allocated allocatedElsewhere available
            item { id quantity finish condition language priceText location { id name }
              printing { id scryfallId imageUrl backImageUrl artCropUrl setCode setName
                         collectorNumber rarity card { name } } } }
        }
      } }
    }
  }
  deckBuylist(id: $id, printingMode: "exact", includeBasicLands: true) {
    cardName quantity missing unavailable reason setCode collectorNumber
    totalPriceCents totalPriceText
  }
  deckBuylistExport(id: $id, format: "text", printingMode: "exact", includeBasicLands: true)
}"#;

const PUBLIC_CARD: &str = r"
query Card($id: ID!) {
  card(id: $id) {
    id oracleId name typeLine manaCost oracleText colorIdentity gameChanger
    edhrecCommanderRank edhrecSaltiness deckCategory deckThemes
    oracleTags { id slug label weight annotation }
    legalities { format status }
    rulings { source publishedAt comment }
    printings(first: 300) {
      pageInfo { endCursor hasNextPage }
      edges { node { id scryfallId setCode setName collectorNumber lang rarity ownedCount
                     finishes imageUrl artCropUrl releasedAt prices priceText } }
    }
  }
}";

// deck_detail_and_share_test.exs: "deck share mutation creates a public
// token and public share query resolves it"
#[tokio::test]
async fn the_public_share_query_resolves_a_shared_deck_without_owner_data() {
    let rulings = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/cards/oracle-share-card/rulings"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": [{
            "source": "wotc", "published_at": "2024-04-05",
            "comment": "Shared card detail exposes public rulings."
        }]})))
        .mount(&rulings)
        .await;
    let app = TestApp::new().await;
    app.import_cards(&[json!({
        "id": "scryfall-share-card",
        "oracle_id": "oracle-share-card",
        "name": "Shared Card",
        "type_line": "Artifact",
        "oracle_text": "Shared oracle text.",
        "collector_number": "9",
        "set": "shr",
        "set_name": "Share Set",
        "lang": "en",
        "image_uris": {},
        "finishes": ["nonfoil"],
        "prices": {"usd": "2.50"},
        "released_at": "2024-02-03",
        "legalities": {"commander": "legal", "modern": "not_legal"},
        "rulings_uri": format!("{}/cards/oracle-share-card/rulings", rulings.uri()),
        "game_changer": true
    })])
    .await;
    sqlx::query(
        "UPDATE scryfall_cards SET edhrec_commander_rank = 42, edhrec_saltiness = 2.25
         WHERE oracle_id = 'oracle-share-card'",
    )
    .execute(app.db())
    .await
    .unwrap();
    let deck = insert_deck(&app, "Shared Deck", "commander", "brewing").await;
    sqlx::query(
        "UPDATE decks SET primer = ?1, ai_analysis = ?2, ai_analysis_model = 'test/model',
           ai_analyzed_at = '2026-08-19T02:09:23Z', commander_bracket = 3,
           commander_bracket_estimate = 2, commander_bracket_rating = '3+' WHERE id = ?3",
    )
    .bind("## Game plan\n\nResolve **Shared Card** and protect it.")
    .bind("## AI overview\n\nBuild value, then turn the corner.")
    .bind(deck)
    .execute(app.db())
    .await
    .unwrap();
    let deck_card = add_card(
        &app,
        deck,
        "oracle-share-card",
        2,
        "mainboard",
        "nonfoil",
        Some("scryfall-share-card"),
    )
    .await;
    let tag: i64 = sqlx::query_scalar(
        "INSERT INTO deck_tags (deck_id, name, color, position, inserted_at, updated_at)
         VALUES (?1, 'Mana Rocks', '#00ff00', 99, ?2, ?2) RETURNING id",
    )
    .bind(deck)
    .bind(T)
    .fetch_one(app.db())
    .await
    .unwrap();
    crate::decks::tags::assign_deck_card_tag(app.db(), crate::decks::DeckCardId(deck_card), tag)
        .await
        .unwrap();
    // An owned copy that the public share must not reveal.
    sqlx::query(
        "INSERT INTO collection_items (scryfall_id, quantity, inserted_at, updated_at)
         VALUES ('scryfall-share-card', 2, ?1, ?1)",
    )
    .bind(T)
    .execute(app.db())
    .await
    .unwrap();
    let share_token = share(&app, deck).await;
    assert!(share_token.len() > 20);

    let data = public_data(&app, SHARED_DECK, json!({"id": share_token})).await;
    let shared = &data["deck"];
    assert_eq!(shared["name"], "Shared Deck");
    assert_eq!(
        shared["primer"],
        "## Game plan\n\nResolve **Shared Card** and protect it."
    );
    assert_eq!(
        shared["aiAnalysis"],
        "## AI overview\n\nBuild value, then turn the corner."
    );
    assert_eq!(shared["aiAnalysisModel"], "test/model");
    assert_eq!(shared["aiAnalyzedAt"], "2026-08-19T02:09:23Z");
    assert_eq!(shared["commanderBracket"], 3);
    assert_eq!(shared["commanderBracketEstimate"], 2);
    assert_eq!(shared["commanderBracketRating"], "3+");
    assert_eq!(shared["shareToken"], share_token.as_str());
    assert_eq!(shared["cardCount"], 2);
    assert_eq!(shared["uniqueCardCount"], 1);
    assert_eq!(shared["legality"]["status"], "illegal");
    assert!(
        shared["legality"]["issues"]
            .as_array()
            .unwrap()
            .iter()
            .any(|issue| issue["cardName"] == "Shared Card"
                && issue["code"].is_string()
                && issue["message"].is_string()
                && issue["severity"].is_string())
    );
    let tags = shared["tags"].as_array().unwrap();
    let tag_id = tag.to_string();
    assert!(tags.iter().any(|t| t["id"] == tag_id.as_str()
        && t["name"] == "Mana Rocks"
        && t["color"] == "#00ff00"
        && t["cardCount"] == 2));
    assert_eq!(shared["deckCards"]["pageInfo"]["hasNextPage"], false);
    let edges = shared["deckCards"]["edges"].as_array().unwrap();
    assert_eq!(edges.len(), 1);
    let node = &edges[0]["node"];
    assert_eq!(node["quantity"], 2);
    assert_eq!(node["priceCents"], 250);
    assert_eq!(node["tagIds"], json!([tag.to_string()]));
    assert_eq!(node["card"]["name"], "Shared Card");
    assert_eq!(node["card"]["gameChanger"], true);
    assert_eq!(node["card"]["edhrecCommanderRank"], 42);
    assert_eq!(node["card"]["edhrecSaltiness"], 2.25);
    assert_eq!(
        node["preferredPrinting"]["scryfallId"],
        "scryfall-share-card"
    );
    assert_eq!(
        node["allocationStatus"],
        json!({"state": "shared", "required": 2, "owned": 0, "allocated": 0,
               "proxyAllocated": 0, "available": 0, "allocatedElsewhere": 0,
               "missing": 0, "candidates": []})
    );
    assert_eq!(
        data["deckBuylist"],
        json!([{"cardName": "Shared Card", "quantity": 2, "missing": 2, "unavailable": 0,
                "reason": "missing", "setCode": "shr", "collectorNumber": "9",
                "totalPriceCents": 500, "totalPriceText": "$5"}])
    );
    assert_eq!(data["deckBuylistExport"], "2 Shared Card (SHR 9)");

    let card_id = node["card"]["id"].as_str().unwrap().to_owned();
    let data = public_data(&app, PUBLIC_CARD, json!({"id": card_id})).await;
    let card = &data["card"];
    assert_eq!(card["id"], card_id.as_str());
    assert_eq!(card["oracleId"], "oracle-share-card");
    assert_eq!(card["manaCost"], Value::Null);
    assert_eq!(card["oracleText"], "Shared oracle text.");
    assert_eq!(card["colorIdentity"], json!([]));
    assert_eq!(card["deckCategory"], "other");
    assert_eq!(card["deckThemes"], json!(["artifact"]));
    assert_eq!(card["oracleTags"], json!([]));
    assert_eq!(
        card["legalities"],
        json!([{"format": "commander", "status": "legal"},
               {"format": "modern", "status": "not_legal"}])
    );
    assert_eq!(
        card["rulings"],
        json!([{"source": "wotc", "publishedAt": "2024-04-05",
                "comment": "Shared card detail exposes public rulings."}])
    );
    assert_eq!(card["printings"]["pageInfo"]["hasNextPage"], false);
    let printing = &card["printings"]["edges"][0]["node"];
    assert_eq!(printing["scryfallId"], "scryfall-share-card");
    assert_eq!(printing["setCode"], "shr");
    assert_eq!(printing["setName"], "Share Set");
    assert_eq!(printing["collectorNumber"], "9");
    assert_eq!(printing["lang"], "en");
    // Two copies are owned; the public schema never says so.
    assert_eq!(printing["ownedCount"], 0);
    assert_eq!(printing["finishes"], json!(["nonfoil"]));
    assert_eq!(printing["imageUrl"], Value::Null);
    assert_eq!(printing["artCropUrl"], Value::Null);
    assert_eq!(printing["releasedAt"], "2024-02-03");
    assert_eq!(printing["prices"], json!({"usd": "2.50"}));
    assert_eq!(printing["priceText"], "$2.50");

    // The same card through `cardByName`, and a printing's card summary.
    let data = public_data(
        &app,
        "{ cardByName(name: \"shared card\") { name producedTokens { ownedCount }
           printings(first: 1) { edges { node { card { id name } } } } } }",
        json!({}),
    )
    .await;
    assert_eq!(data["cardByName"]["name"], "Shared Card");
    assert_eq!(
        data["cardByName"]["printings"]["edges"][0]["node"]["card"],
        json!({"id": card_id, "name": "Shared Card"})
    );
}

#[tokio::test]
async fn unshared_decks_resolve_to_nothing() {
    let app = TestApp::new().await;
    let deck = insert_deck(&app, "Private", "commander", "brewing").await;
    let token = share(&app, deck).await;
    crate::decks::records::disable_sharing(app.db(), crate::decks::DeckId(deck))
        .await
        .unwrap();
    let data = public_data(
        &app,
        "query($id: ID!) { deck(id: $id) { name } deckBuylist(id: $id) { cardName }
           deckBuylistExport(id: $id) }",
        json!({"id": token}),
    )
    .await;
    assert_eq!(
        data,
        json!({"deck": null, "deckBuylist": [], "deckBuylistExport": ""})
    );
    // A deck's global id is not a share token.
    let global = crate::graphql::global_id(crate::graphql::NodeKind::Deck, deck);
    let data = public_data(
        &app,
        "query($id: ID!) { deck(id: $id) { name } }",
        json!({"id": global}),
    )
    .await;
    assert_eq!(data, json!({"deck": null}));
}
