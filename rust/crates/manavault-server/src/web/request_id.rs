//! Request ids and request logging, as earlier releases logged requests in
//! production (`Plug.RequestId` and the endpoint's telemetry logger).
//!
//! Every routed request gets an `x-request-id` response header: the client's
//! own when it is 20 to 200 bytes long, otherwise a fresh 20-character id. The
//! request runs inside a `request` span carrying that id, and two info lines
//! are logged: `GET /path` on arrival (the path only, never the query string,
//! which can carry tokens) and `Sent 200 in 4ms` on completion. Bodies are
//! never logged. Both lines also reach the live server logs (`serverLog`).
//!
//! Static files are served by the layer outside this one and are not logged,
//! like the static plugs that ran before the request logger. The WebSocket
//! upgrade (`/api/graphql/ws`) is not a request in this sense. Scryfall symbol/set
//! assets and scanner model bundle files get an id but are not logged: they
//! are static content served per card or model file, and logging them would
//! drown the log.

use std::time::Instant;

use axum::extract::Request;
use axum::http::HeaderValue;
use axum::middleware::Next;
use axum::response::Response;
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use tracing::Instrument;

/// The request id header.
pub const HEADER: &str = "x-request-id";

/// How a path is treated.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Treatment {
    /// Gets an id and is logged.
    Logged,
    /// Gets an id but is not logged (static-like content behind the router).
    Quiet,
    /// Not a request to tag (the WebSocket upgrade).
    Untouched,
}

fn treatment(path: &str) -> Treatment {
    if path == "/api/graphql/ws" {
        Treatment::Untouched
    } else if path.starts_with("/scryfall-assets/")
        || path == "/api/scanner/bundle"
        || path.starts_with("/api/scanner/bundles/")
    {
        Treatment::Quiet
    } else {
        Treatment::Logged
    }
}

/// The client's id when it is 20 to 200 bytes of visible ASCII, otherwise a
/// new random one.
fn request_id(request: &Request) -> HeaderValue {
    request
        .headers()
        .get(HEADER)
        .filter(|value| (20..=200).contains(&value.len()) && value.to_str().is_ok())
        .cloned()
        .or_else(|| {
            HeaderValue::from_str(&URL_SAFE_NO_PAD.encode(crate::crypto::random_bytes::<15>())).ok()
        })
        .unwrap_or_else(|| HeaderValue::from_static("unknown-request-id--"))
}

/// Tags the request with an id and logs it.
pub async fn layer(request: Request, next: Next) -> Response {
    let path = request.uri().path().to_owned();
    let treatment = treatment(&path);
    if treatment == Treatment::Untouched {
        return next.run(request).await;
    }
    let id = request_id(&request);
    let span = tracing::info_span!("request", request_id = id.to_str().unwrap_or_default());
    let method = request.method().clone();
    async move {
        let started = Instant::now();
        if treatment == Treatment::Logged {
            tracing::info!("{method} {path}");
        }
        let mut response = next.run(request).await;
        if treatment == Treatment::Logged {
            tracing::info!(
                "Sent {} in {}ms",
                response.status().as_u16(),
                started.elapsed().as_millis()
            );
        }
        response.headers_mut().insert(HEADER, id);
        response
    }
    .instrument(span)
    .await
}

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::Request;

    use super::HEADER;
    use crate::test_support::{TestApp, log_hub};

    async fn get(app: &TestApp, uri: &str, id: Option<&str>) -> axum::http::Response<Body> {
        let mut request = Request::get(uri);
        if let Some(id) = id {
            request = request.header(HEADER, id);
        }
        app.request(request.body(Body::empty()).unwrap()).await
    }

    /// Log messages from this module, captured through the live log hub (the
    /// same stream the `serverLog` subscription reads).
    fn drain(
        receiver: &mut tokio::sync::broadcast::Receiver<crate::logs::LogEvent>,
    ) -> Vec<String> {
        use tokio::sync::broadcast::error::TryRecvError;
        let mut lines = Vec::new();
        loop {
            match receiver.try_recv() {
                Ok(event) => lines.push(event.message),
                Err(TryRecvError::Lagged(_)) => {}
                Err(_) => return lines,
            }
        }
    }

    #[tokio::test]
    async fn keeps_a_valid_incoming_id_and_logs_the_request() {
        let app = TestApp::new().await;
        let mut logs = log_hub().subscribe();
        let id = "client-supplied-request-id-0001";
        // A path unique to this test, since every test shares the log hub.
        let path = "/no-such-page-request-id-test";
        let response = get(&app, &format!("{path}?token=secret-value"), Some(id)).await;
        assert_eq!(response.status(), 404);
        assert_eq!(response.headers()[HEADER], id);
        let lines = drain(&mut logs);
        let arrival = lines
            .iter()
            .position(|line| *line == format!("GET {path}"))
            .expect("an arrival line");
        assert!(
            lines[arrival..]
                .iter()
                .any(|line| line.starts_with("Sent 404 in ") && line.ends_with("ms")),
            "{lines:?}"
        );
        assert!(
            lines.iter().all(|line| !line.contains("secret-value")),
            "query strings are never logged: {lines:?}"
        );
    }

    #[tokio::test]
    async fn generates_an_id_when_missing_or_out_of_range() {
        let app = TestApp::new().await;
        for incoming in [None, Some("too-short"), Some(&*"x".repeat(201))] {
            let response = get(&app, "/health", incoming).await;
            let id = response.headers()[HEADER].to_str().unwrap().to_owned();
            assert_eq!(id.len(), 20, "{incoming:?} -> {id}");
            assert_ne!(Some(id.as_str()), incoming);
        }
        let first = get(&app, "/health", None).await.headers()[HEADER].clone();
        let second = get(&app, "/health", None).await.headers()[HEADER].clone();
        assert_ne!(first, second);
    }

    #[tokio::test]
    async fn static_files_and_assets_are_not_logged() {
        let app = TestApp::new().await;
        let robots = app.state.config.static_dir.join("robots.txt");
        std::fs::create_dir_all(robots.parent().unwrap()).unwrap();
        std::fs::write(&robots, "User-agent: *\n").unwrap();
        let mut logs = log_hub().subscribe();

        let response = get(&app, "/robots.txt", None).await;
        assert_eq!(response.status(), 200);
        assert!(
            response.headers().get(HEADER).is_none(),
            "static files are served before request ids"
        );
        let response = get(&app, "/scryfall-assets/symbols/W.svg", None).await;
        assert!(response.headers().get(HEADER).is_some());

        let lines = drain(&mut logs);
        assert!(
            lines
                .iter()
                .all(|line| !line.contains("/robots.txt") && !line.contains("/scryfall-assets")),
            "{lines:?}"
        );
    }
}
