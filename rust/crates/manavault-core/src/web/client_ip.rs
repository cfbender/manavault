//! The client identifier for rate limiting (`ManavaultWeb.ClientIP`).
//!
//! By default this is the peer address. Behind a trusted reverse proxy
//! (`MANAVAULT_TRUST_PROXY_HEADERS=true`) it is the rightmost entry of the
//! forwarded header (`MANAVAULT_FORWARDED_IP_HEADER`, default
//! `x-forwarded-for`), the one entry the client cannot spoof.
//! `MANAVAULT_TRUSTED_PROXIES` limits that to requests whose peer is one of
//! the listed addresses or CIDR ranges; others use the peer address.

use std::net::{IpAddr, SocketAddr};

use axum::extract::ConnectInfo;
use axum::http::{HeaderMap, Request};

use crate::config::Config;

const UNKNOWN: &str = "unknown";

/// An invalid `MANAVAULT_TRUSTED_PROXIES` entry.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error(
    "environment variable MANAVAULT_TRUSTED_PROXIES has an invalid entry: {0:?}.\nEach entry must be an IP address or a CIDR range, e.g. MANAVAULT_TRUSTED_PROXIES=172.18.0.0/16,10.0.0.5"
)]
pub struct InvalidProxy(pub String);

/// A trusted proxy address or CIDR range.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TrustedProxy {
    network: IpAddr,
    prefix: u32,
}

impl TrustedProxy {
    fn parse(entry: &str) -> Result<Self, InvalidProxy> {
        let invalid = || InvalidProxy(entry.to_owned());
        let (address, prefix) = match entry.split_once('/') {
            Some((address, prefix)) => (address, Some(prefix)),
            None => (entry, None),
        };
        let network: IpAddr = address.parse().map_err(|_| invalid())?;
        let network = network.to_canonical();
        let bits = if network.is_ipv4() { 32 } else { 128 };
        let prefix = match prefix {
            Some(prefix) => prefix.parse().map_err(|_| invalid())?,
            None => bits,
        };
        if prefix > bits {
            return Err(invalid());
        }
        Ok(Self { network, prefix })
    }

    /// Whether `ip` (canonicalized, so IPv4-mapped IPv6 matches IPv4) is in
    /// the range.
    #[must_use]
    pub fn contains(&self, ip: IpAddr) -> bool {
        match (self.network, ip.to_canonical()) {
            (IpAddr::V4(network), IpAddr::V4(ip)) => {
                let mask = u32::MAX.checked_shl(32 - self.prefix).unwrap_or(0);
                u32::from(network) & mask == u32::from(ip) & mask
            }
            (IpAddr::V6(network), IpAddr::V6(ip)) => {
                let mask = u128::MAX.checked_shl(128 - self.prefix).unwrap_or(0);
                u128::from(network) & mask == u128::from(ip) & mask
            }
            _ => false,
        }
    }
}

/// Parses a comma-separated list of addresses and CIDR ranges.
pub fn parse_trusted_proxies(value: &str) -> Result<Vec<TrustedProxy>, InvalidProxy> {
    value
        .split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(TrustedProxy::parse)
        .collect()
}

/// The identifier for a request.
#[must_use]
pub fn identifier(config: &Config, headers: &HeaderMap, peer: Option<SocketAddr>) -> String {
    let trusted_peer = config.trusted_proxies.is_empty()
        || peer.is_some_and(|addr| {
            config
                .trusted_proxies
                .iter()
                .any(|proxy| proxy.contains(addr.ip()))
        });
    if config.trust_proxy_headers
        && trusted_peer
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

    fn config(trust: bool, header: &str) -> (crate::testing::TempDir, Config) {
        let dir = crate::testing::TempDir::new();
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
    fn honors_the_forwarded_header_only_from_trusted_proxies() {
        let (_dir, mut config) = config(true, "cf-connecting-ip");
        config.trusted_proxies = parse_trusted_proxies("172.20.69.0/24, 10.0.0.5").unwrap();
        let headers = headers("cf-connecting-ip", "198.51.100.4");
        for proxy in [
            "172.20.69.20",
            "172.20.69.255",
            "10.0.0.5",
            "::ffff:172.20.69.20",
        ] {
            assert_eq!(
                identifier(&config, &headers, peer(proxy)),
                "198.51.100.4",
                "{proxy}"
            );
        }
        for direct in ["172.20.70.1", "172.20.68.255", "10.0.0.6", "::1"] {
            assert_eq!(identifier(&config, &headers, peer(direct)), direct);
        }
        assert_eq!(identifier(&config, &headers, None), "unknown");
    }

    #[test]
    fn parses_addresses_and_ranges() {
        let proxies = parse_trusted_proxies("0.0.0.0/0,fd00::/8, ,::ffff:10.0.0.1").unwrap();
        assert_eq!(proxies.len(), 3);
        let ip = |s: &str| s.parse::<IpAddr>().unwrap();
        assert!(proxies[0].contains(ip("203.0.113.9")));
        assert!(!proxies[0].contains(ip("2001:db8::1")));
        assert!(proxies[1].contains(ip("fdab::1")));
        assert!(!proxies[1].contains(ip("fe00::1")));
        assert!(proxies[2].contains(ip("10.0.0.1")));
        for invalid in ["10.0.0.0/33", "fd00::/129", "10.0.0", "10.0.0.0/", "proxy"] {
            assert_eq!(
                parse_trusted_proxies(invalid),
                Err(InvalidProxy(invalid.to_owned()))
            );
        }
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
