//! EDHREC commander ranks (`Manavault.Catalog.EDHRec.CommanderRanks`).
//!
//! EDHREC's yearly commander index is paginated: the first page wraps its
//! card lists in `container.json_dict.cardlists`, and continuation pages are
//! a bare card list. Each card view names a Scryfall printing id and a rank.

use std::collections::{HashMap, HashSet};
use std::time::Duration;

use lotus::scryfall::ScryfallClient;
use serde_json::Value;
use sqlx::{QueryBuilder, Row, SqlitePool};

use super::{Metric, MetricValue, UPDATE_BATCH_SIZE, clear_stale, update_batch};
use crate::catalog::scryfall::push_in_list;

/// The yearly commander index.
pub const COMMANDER_RANKS_URL: &str = "https://json.edhrec.com/pages/commanders/year.json";
/// Where relative continuation paths resolve.
pub const PAGES_BASE_URL: &str = "https://json.edhrec.com/pages/";

async fn fetch_page(client: &ScryfallClient, url: &str) -> Result<Value, String> {
    client
        .get_json::<Value>(url)
        .await
        .map_err(|error| crate::catalog::scryfall::sync::format_fetch_error(&error))
}

/// Ranks by Scryfall printing id.
pub type Ranks = HashMap<String, i64>;

/// Follows the index's continuation links and collects every ranked
/// commander. Partner pairs are skipped. A page without a card list, a
/// repeated page, or an index without any ranked commander is an error, so
/// a partial feed never clears existing ranks.
pub async fn fetch(
    client: &ScryfallClient,
    url: &str,
    pages_base_url: &str,
    page_delay: Duration,
) -> Result<(Ranks, usize), String> {
    let mut visited = HashSet::new();
    let mut ranks = Ranks::new();
    let mut page_count = 0_usize;
    let mut url = url.to_owned();
    loop {
        if visited.contains(&url) {
            return Err(format!(
                "EDHREC commander ranking pagination repeated {url}"
            ));
        }
        let page = fetch_page(client, &url).await?;
        if !page.is_object() {
            return Err("EDHREC commander ranking payload was not a JSON object".to_owned());
        }
        let (page_ranks, next_path) = page_data(&page)?;
        ranks.extend(page_ranks);
        page_count += 1;
        let Some(next_path) = next_path else {
            break;
        };
        if !page_delay.is_zero() {
            tokio::time::sleep(page_delay).await;
        }
        visited.insert(url);
        url = page_url(pages_base_url, &next_path);
    }
    if ranks.is_empty() {
        return Err("EDHREC commander ranking payload had no ranked commanders".to_owned());
    }
    Ok((ranks, page_count))
}

fn page_data(page: &Value) -> Result<(Ranks, Option<String>), String> {
    let single;
    let cardlists: &Vec<Value> = if page.get("cardviews").is_some_and(Value::is_array) {
        single = vec![page.clone()];
        &single
    } else {
        page.pointer("/container/json_dict/cardlists")
            .and_then(Value::as_array)
            .ok_or_else(|| "EDHREC commander ranking payload had no card list".to_owned())?
    };
    let mut ranks = Ranks::new();
    for view in cardlists
        .iter()
        .filter_map(|list| list.get("cardviews").and_then(Value::as_array))
        .flatten()
    {
        let (Some(id), Some(rank)) = (
            view.get("id").and_then(Value::as_str),
            view.get("rank").and_then(Value::as_i64),
        ) else {
            continue;
        };
        if rank > 0 && view.get("is_partner") != Some(&Value::Bool(true)) {
            ranks.insert(id.to_owned(), rank);
        }
    }
    let next = cardlists.iter().find_map(|list| {
        list.get("more")
            .and_then(Value::as_str)
            .filter(|path| !path.is_empty())
            .map(str::to_owned)
    });
    Ok((ranks, next))
}

fn page_url(base: &str, path: &str) -> String {
    if path.starts_with(PAGES_BASE_URL) || path.starts_with(base) {
        path.to_owned()
    } else {
        format!("{base}{}", path.trim_start_matches('/'))
    }
}

/// Stores ranks on the cards of the ranked printings and clears every other
/// card's rank. Returns how many cards were ranked.
pub async fn update_cards(pool: &SqlitePool, ranks: &Ranks) -> Result<usize, sqlx::Error> {
    let entries: Vec<(&String, &i64)> = ranks.iter().collect();
    let mut updated = HashSet::new();
    let mut count = 0_usize;
    for batch in entries.chunks(UPDATE_BATCH_SIZE) {
        let by_printing: HashMap<&str, i64> = batch
            .iter()
            .map(|(id, rank)| (id.as_str(), **rank))
            .collect();
        let ids: Vec<String> = batch.iter().map(|(id, _)| (*id).clone()).collect();
        let mut select = QueryBuilder::new(
            "SELECT scryfall_id, oracle_id FROM scryfall_printings WHERE scryfall_id IN",
        );
        push_in_list(&mut select, &ids);
        let mut by_oracle: Vec<(String, MetricValue)> = Vec::new();
        for row in select.build().fetch_all(pool).await? {
            let printing: String = row.try_get("scryfall_id")?;
            let oracle_id: String = row.try_get("oracle_id")?;
            let Some(rank) = by_printing.get(printing.as_str()) else {
                continue;
            };
            match by_oracle.iter_mut().find(|(id, _)| *id == oracle_id) {
                Some((_, value)) => *value = MetricValue::Integer(*rank),
                None => by_oracle.push((oracle_id, MetricValue::Integer(*rank))),
            }
        }
        update_batch(pool, Metric::CommanderRank, &by_oracle).await?;
        count += by_oracle.len();
        updated.extend(by_oracle.into_iter().map(|(id, _)| id));
    }
    // Resolved oracle ids, not EDHREC's printing ids, decide what is stale.
    clear_stale(pool, Metric::CommanderRank, &updated).await?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    use super::*;

    pub fn commander_rank_page(cardviews: &Value, more: Option<&str>) -> Value {
        let mut cardlist = json!({"cardviews": cardviews});
        if let (Some(more), Some(list)) = (more, cardlist.as_object_mut()) {
            list.insert("more".to_owned(), json!(more));
        }
        json!({"container": {"json_dict": {"cardlists": [cardlist]}}})
    }

    fn client() -> lotus::scryfall::ScryfallClient {
        lotus::scryfall::ScryfallClient::with_client(reqwest::Client::new(), "http://unused")
    }

    async fn mount(server: &MockServer, route: &str, body: Value) {
        Mock::given(method("GET"))
            .and(path(route))
            .respond_with(ResponseTemplate::new(200).set_body_json(body))
            .mount(server)
            .await;
    }

    #[tokio::test]
    async fn follows_continuation_links_and_rejects_partial_feeds() {
        let server = MockServer::start().await;
        let base = format!("{}/pages/", server.uri());
        mount(
            &server,
            "/pages/commanders/year.json",
            commander_rank_page(
                &json!([{"id": "first-printing", "rank": 1}]),
                Some("commanders/year-past2years-1.json"),
            ),
        )
        .await;
        mount(
            &server,
            "/pages/commanders/year-past2years-1.json",
            json!({"cardviews": [
                {"id": "second-printing", "rank": 101},
                {"id": "partner-pair", "rank": 102, "is_partner": true}
            ], "more": "commanders/year-past2years-2.json"}),
        )
        .await;
        let third = Mock::given(method("GET"))
            .and(path("/pages/commanders/year-past2years-2.json"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(json!({"cardviews": [{"id": "third-printing", "rank": 201}]})),
            )
            .up_to_n_times(1)
            .mount_as_scoped(&server)
            .await;

        let first = format!("{base}commanders/year.json");
        let (ranks, pages) = fetch(&client(), &first, &base, Duration::ZERO)
            .await
            .unwrap();
        assert_eq!(pages, 3);
        assert_eq!(
            ranks,
            HashMap::from([
                ("first-printing".to_owned(), 1),
                ("second-printing".to_owned(), 101),
                ("third-printing".to_owned(), 201),
            ])
        );
        drop(third);

        mount(
            &server,
            "/pages/commanders/year-past2years-2.json",
            json!({"cardviews": null}),
        )
        .await;
        assert_eq!(
            fetch(&client(), &first, &base, Duration::ZERO).await,
            Err("EDHREC commander ranking payload had no card list".to_owned())
        );
    }

    #[tokio::test]
    async fn repeated_pages_and_empty_indexes_are_errors() {
        let server = MockServer::start().await;
        let base = format!("{}/pages/", server.uri());
        mount(
            &server,
            "/pages/loop.json",
            commander_rank_page(&json!([{"id": "a", "rank": 1}]), Some("loop.json")),
        )
        .await;
        mount(
            &server,
            "/pages/empty.json",
            commander_rank_page(&json!([]), None),
        )
        .await;
        let looped = fetch(
            &client(),
            &format!("{base}loop.json"),
            &base,
            Duration::ZERO,
        )
        .await;
        assert!(looped.unwrap_err().contains("repeated"));
        assert_eq!(
            fetch(
                &client(),
                &format!("{base}empty.json"),
                &base,
                Duration::ZERO
            )
            .await,
            Err("EDHREC commander ranking payload had no ranked commanders".to_owned())
        );
    }
}
