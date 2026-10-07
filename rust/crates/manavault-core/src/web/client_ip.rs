//! The client identifier for rate limiting (`ManavaultWeb.ClientIP`).
//!
//! By default this is the peer address. Behind a trusted reverse proxy
//! (`MANAVAULT_TRUST_PROXY_HEADERS=true`) it is the rightmost entry of the
//! forwarded header (`MANAVAULT_FORWARDED_IP_HEADER`, default
//! `x-forwarded-for`), the one entry the client cannot spoof.

use std::net::SocketAddr;

use axum::extract::ConnectInfo;
use axum::http::{HeaderMap, Request};

use crate::config::Config;

const UNKNOWN: &str = "unknown";

/// The identifier for a request.
#[must_use]
pub fn identifier(config: &Config, headers: &HeaderMap, peer: Option<SocketAddr>) -> String {
    if config.trust_proxy_headers
        && let Some(forwarded) = forwarded_ip(headers, &config.forwarded_ip_header)
    {
        return forwarded;
    }
    peer.map_or_else(|| UNKNOWN.to_owned(), |addr| addr.ip().to_string())
}

/// The identifier for an axum request, reading the peer from `ConnectInfo`.
#[must_use]
pub fn for_request<B>(config: &Config, request: &Request<B>) -> String {
    let peer = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|info| info.0);
    identifier(config, request.headers(), peer)
}

fn forwarded_ip(headers: &HeaderMap, header: &str) -> Option<String> {
    let joined = headers
        .get_all(header)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .collect::<Vec<_>>()
        .join(",");
    joined
        .split(',')
        .map(str::trim)
        .rfind(|entry| !entry.is_empty())
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    fn config(trust: bool, header: &str) -> (crate::test_support::TempDir, Config) {
        let dir = crate::test_support::TempDir::new();
        let mut config = Config::for_tests(dir.path().to_path_buf());
        config.trust_proxy_headers = trust;
        config.forwarded_ip_header = header.to_owned();
        (dir, config)
    }

    fn headers(name: &'static str, value: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(name, HeaderValue::from_str(value).unwrap());
        headers
    }

    fn peer(ip: &str) -> Option<SocketAddr> {
        ip.parse().ok().map(|ip| SocketAddr::new(ip, 5000))
    }

    #[test]
    fn uses_the_peer_ip_by_default_and_ignores_forwarded_headers() {
        let (_dir, config) = config(false, "x-forwarded-for");
        let headers = headers("x-forwarded-for", "203.0.113.7");
        assert_eq!(
            identifier(&config, &headers, peer("192.168.1.10")),
            "192.168.1.10"
        );
    }

    #[test]
    fn uses_the_rightmost_forwarded_entry_when_proxy_headers_are_trusted() {
        let (_dir, config) = config(true, "x-forwarded-for");
        let headers = headers("x-forwarded-for", "1.1.1.1, 203.0.113.7");
        assert_eq!(
            identifier(&config, &headers, peer("10.0.0.1")),
            "203.0.113.7"
        );
    }

    #[test]
    fn falls_back_to_the_peer_ip_without_a_forwarded_header() {
        let (_dir, config) = config(true, "x-forwarded-for");
        assert_eq!(
            identifier(&config, &HeaderMap::new(), peer("10.0.0.1")),
            "10.0.0.1"
        );
        assert_eq!(identifier(&config, &HeaderMap::new(), None), "unknown");
    }

    #[test]
    fn ignores_empty_forwarded_entries_and_trims_whitespace() {
        let (_dir, config) = config(true, "x-forwarded-for");
        let headers = headers("x-forwarded-for", "203.0.113.7 ,   ");
        assert_eq!(
            identifier(&config, &headers, peer("10.0.0.1")),
            "203.0.113.7"
        );
    }

    #[test]
    fn supports_a_custom_forwarded_header_name() {
        let (_dir, config) = config(true, "x-real-ip");
        let headers = headers("x-real-ip", "198.51.100.4");
        assert_eq!(
            identifier(&config, &headers, peer("10.0.0.1")),
            "198.51.100.4"
        );
    }
}
