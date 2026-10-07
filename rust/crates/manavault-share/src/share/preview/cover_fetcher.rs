//! Embeds the deck cover in the rendered preview
//! (`DeckSharePreview.CoverFetcher`): only Scryfall image hosts over HTTPS,
//! no redirects, short timeouts, a streamed size cap, and image MIME types
//! only. Anything else falls back to the plain background.

use std::future::Future;
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use futures_util::StreamExt as _;

const ALLOWED_HOSTS: [&str; 2] = ["cards.scryfall.io", "img.scryfall.com"];
const ALLOWED_MIME_TYPES: [&str; 6] = [
    "image/avif",
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/svg+xml",
    "image/webp",
];
/// Default response size cap.
pub const DEFAULT_MAX_BYTES: usize = 5_000_000;
const TIMEOUT: Duration = Duration::from_millis(1_500);

/// A fetched response.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Fetched {
    pub status: u16,
    pub content_type: Option<String>,
    pub content_length: Option<u64>,
    pub body: Vec<u8>,
}

/// Why a fetch failed.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum FetchError {
    #[error("request failed")]
    Request,
    #[error("body too large")]
    BodyTooLarge,
}

fn normalize_content_type(value: &str) -> String {
    value
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
}

/// `allowed_mime_type?/1`.
#[must_use]
pub fn allowed_mime_type(content_type: &str) -> bool {
    ALLOWED_MIME_TYPES.contains(&normalize_content_type(content_type).as_str())
}

fn allowed_remote_url(url: &str) -> bool {
    url::Url::parse(url).is_ok_and(|url| {
        url.scheme() == "https"
            && url
                .host_str()
                .is_some_and(|host| ALLOWED_HOSTS.contains(&host.to_ascii_lowercase().as_str()))
    })
}

fn data_image_url(url: &str) -> bool {
    url.split_once(',').is_some_and(|(metadata, _)| {
        allowed_mime_type(metadata.strip_prefix("data:").unwrap_or(metadata))
    })
}

fn to_data_url(response: &Fetched, max_bytes: usize) -> Option<String> {
    if !(200..=299).contains(&response.status) {
        return None;
    }
    let within_limit = response.body.len() <= max_bytes
        && response
            .content_length
            .is_none_or(|length| usize::try_from(length).is_ok_and(|length| length <= max_bytes));
    let content_type = normalize_content_type(response.content_type.as_deref()?);
    (within_limit && allowed_mime_type(&content_type)).then(|| {
        format!(
            "data:{content_type};base64,{}",
            STANDARD.encode(&response.body)
        )
    })
}

/// `prepare/2` with an injectable fetcher: a data URL for the cover, or
/// `None` to draw the default background.
pub async fn prepare_with<F, Fut>(url: Option<&str>, max_bytes: usize, fetch: F) -> Option<String>
where
    F: FnOnce(String) -> Fut,
    Fut: Future<Output = Result<Fetched, FetchError>>,
{
    let url = url?;
    if url.starts_with("data:") {
        return (data_image_url(url) && url.len() <= max_bytes).then(|| url.to_owned());
    }
    if !allowed_remote_url(url) {
        return None;
    }
    to_data_url(&fetch(url.to_owned()).await.ok()?, max_bytes)
}

/// `prepare/1`: fetches covers over the network.
pub async fn prepare(url: Option<&str>) -> Option<String> {
    prepare_with(url, DEFAULT_MAX_BYTES, |url| fetch(url, DEFAULT_MAX_BYTES)).await
}

/// `fetch/2`: GET without redirects, streaming at most `max_bytes`.
pub async fn fetch(url: String, max_bytes: usize) -> Result<Fetched, FetchError> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(TIMEOUT)
        .read_timeout(TIMEOUT)
        .build()
        .map_err(|_| FetchError::Request)?;
    let response = client
        .get(&url)
        .header(
            reqwest::header::ACCEPT,
            "image/avif,image/gif,image/jpeg,image/png,image/svg+xml,image/webp",
        )
        .send()
        .await
        .map_err(|_| FetchError::Request)?;
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let content_length = response
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok());
    if content_length
        .is_some_and(|length| usize::try_from(length).map_or(true, |length| length > max_bytes))
    {
        return Err(FetchError::BodyTooLarge);
    }
    let mut body = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| FetchError::Request)?;
        body.extend_from_slice(&chunk);
        if body.len() > max_bytes {
            return Err(FetchError::BodyTooLarge);
        }
    }
    Ok(Fetched {
        status,
        content_type,
        content_length,
        body,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const URL: &str = "https://cards.scryfall.io/preview.png";

    fn png(content_length: Option<u64>, body: &str, content_type: &str) -> Fetched {
        Fetched {
            status: 200,
            content_type: Some(content_type.to_owned()),
            content_length,
            body: body.as_bytes().to_vec(),
        }
    }

    // "invalid, timed out, and oversized remote covers fall back safely"
    #[tokio::test]
    async fn invalid_timed_out_and_oversized_covers_fall_back() {
        let ok = prepare_with(Some(URL), 4, |_| async {
            Ok(png(Some(3), "png", "image/png"))
        });
        assert_eq!(ok.await.as_deref(), Some("data:image/png;base64,cG5n"));
        let timeout = prepare_with(Some(URL), 4, |_| async { Err(FetchError::Request) });
        assert_eq!(timeout.await, None);
        let declared = prepare_with(Some(URL), 4, |_| async {
            Ok(png(Some(5), "png", "image/png"))
        });
        assert_eq!(declared.await, None);
        let streamed = prepare_with(Some(URL), 4, |_| async {
            Ok(png(None, "overs", "image/png"))
        });
        assert_eq!(streamed.await, None);
        let html = prepare_with(Some(URL), 4, |_| async {
            Ok(png(None, "not", "text/html"))
        });
        assert_eq!(html.await, None);
        for url in [
            "http://cards.scryfall.io/preview.png",
            "https://example.com/preview.png",
        ] {
            let refused = prepare_with(Some(url), 4, |_| async {
                Ok(png(None, "png", "image/png"))
            });
            assert_eq!(refused.await, None);
        }
        let data = "data:image/svg+xml;utf8,%3Csvg%3E";
        assert_eq!(
            prepare_with(Some(data), 100, |_| async { Err(FetchError::Request) })
                .await
                .as_deref(),
            Some(data)
        );
        assert_eq!(
            prepare_with(Some("data:text/html,x"), 100, |_| async {
                Err(FetchError::Request)
            })
            .await,
            None
        );
    }

    #[tokio::test]
    async fn fetch_streams_with_a_cap_and_no_redirects() {
        use wiremock::matchers::path;
        use wiremock::{Mock, MockServer, ResponseTemplate};
        let server = MockServer::start().await;
        Mock::given(path("/ok.png"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-type", "image/png")
                    .set_body_bytes(b"png".to_vec()),
            )
            .mount(&server)
            .await;
        Mock::given(path("/big.png"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(vec![0u8; 64]))
            .mount(&server)
            .await;
        Mock::given(path("/moved.png"))
            .respond_with(ResponseTemplate::new(302).insert_header("location", "/ok.png"))
            .mount(&server)
            .await;
        let ok = fetch(format!("{}/ok.png", server.uri()), 10).await.unwrap();
        assert_eq!(ok.body, b"png");
        assert_eq!(ok.content_type.as_deref(), Some("image/png"));
        assert_eq!(
            fetch(format!("{}/big.png", server.uri()), 10).await,
            Err(FetchError::BodyTooLarge)
        );
        let moved = fetch(format!("{}/moved.png", server.uri()), 10)
            .await
            .unwrap();
        assert_eq!(moved.status, 302);
        assert_eq!(to_data_url(&moved, 10), None);
    }
}
