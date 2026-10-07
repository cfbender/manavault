//! User-facing reasons for failed outbound HTTP requests.
//!
//! Elixir builds messages such as `"Could not reach EDHREC: #{reason}"` from
//! `Exception.message/1` of a `Req.TransportError`, which renders the Mint
//! transport reason with `:inet.format_error/1` (`"non-existing domain"`,
//! `"connection refused"`, `"timeout"`, ...). reqwest's own `Display`
//! (`"error sending request for url (...)"`) leaks the URL and reads
//! differently, so the common transport failures are mapped to the same
//! words here. Found by the differential parity harness.

use std::error::Error as _;
use std::io::ErrorKind;

/// The reason text Req would report for a failed request.
#[must_use]
pub fn transport_message(error: &reqwest::Error) -> String {
    if error.is_timeout() {
        return "timeout".to_owned();
    }
    let mut source = error.source();
    while let Some(cause) = source {
        if let Some(io) = cause.downcast_ref::<std::io::Error>()
            && let Some(reason) = io_reason(io.kind())
        {
            return reason.to_owned();
        }
        let text = cause.to_string();
        if text.contains("dns error") || text.contains("failed to lookup address") {
            return "non-existing domain".to_owned();
        }
        source = cause.source();
    }
    // Never echo the URL: presigned S3 URLs carry credentials and signatures.
    let text = error.to_string();
    match error.url() {
        Some(url) => text.replace(&format!(" for url ({url})"), ""),
        None => text,
    }
}

fn io_reason(kind: ErrorKind) -> Option<&'static str> {
    match kind {
        ErrorKind::ConnectionRefused => Some("connection refused"),
        ErrorKind::ConnectionReset => Some("connection reset by peer"),
        ErrorKind::ConnectionAborted => Some("software caused connection abort"),
        ErrorKind::TimedOut => Some("timeout"),
        ErrorKind::HostUnreachable => Some("host is unreachable"),
        ErrorKind::NetworkUnreachable => Some("network is unreachable"),
        ErrorKind::UnexpectedEof | ErrorKind::BrokenPipe => Some("socket closed"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn failure(url: &str) -> reqwest::Error {
        reqwest::Client::new()
            .get(url)
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await
            .unwrap_err()
    }

    #[tokio::test]
    async fn refused_connections_read_like_mint() {
        // Nothing listens on the discard port.
        let error = failure("http://127.0.0.1:9/").await;
        assert_eq!(transport_message(&error), "connection refused");
    }

    /// A resolver that fails like `getaddrinfo` does for an unknown host,
    /// so the test needs no DNS server.
    struct NoSuchHost;

    impl reqwest::dns::Resolve for NoSuchHost {
        fn resolve(&self, _name: reqwest::dns::Name) -> reqwest::dns::Resolving {
            Box::pin(async {
                let error: Box<dyn std::error::Error + Send + Sync> =
                    Box::new(std::io::Error::other(
                        "failed to lookup address information: Name or service not known",
                    ));
                Err(error)
            })
        }
    }

    #[tokio::test]
    async fn unknown_hosts_read_like_mint() {
        let client = reqwest::Client::builder()
            .dns_resolver(std::sync::Arc::new(NoSuchHost))
            .build()
            .unwrap();
        let error = client
            .get("http://json.edhrec.example/")
            .send()
            .await
            .unwrap_err();
        assert_eq!(transport_message(&error), "non-existing domain");
    }
}
