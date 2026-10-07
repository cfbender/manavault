//! WebSocket origin checks (`ManavaultWeb.AllowedOrigins`): the configured
//! allowed origins, matched by scheme, host, and port.
//!
//! By default only origins whose host is `PHX_HOST` may open the socket.
//! `MANAVAULT_ALLOWED_ORIGINS` lists extra `http(s)://host[:port]` origins;
//! `PHX_HOST` stays allowed by host alone. Development accepts any origin
//! (`MANAVAULT_ENV=dev`).

use crate::config::{Config, Env};

/// An invalid `MANAVAULT_ALLOWED_ORIGINS` entry.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error(
    "environment variable MANAVAULT_ALLOWED_ORIGINS has an invalid entry: {0:?}.\nEach entry must be http:// or https:// followed by a hostname and an optional port,\nwith no path, e.g. MANAVAULT_ALLOWED_ORIGINS=https://manavault.mytailnet.ts.net"
)]
pub struct InvalidOrigin(pub String);

/// Parses a comma-separated origin list: trims whitespace and trailing
/// slashes, lowercases, drops blanks and duplicates.
pub fn parse(value: Option<&str>) -> Result<Vec<String>, InvalidOrigin> {
    let mut origins: Vec<String> = Vec::new();
    for entry in value
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
    {
        let origin = normalize(entry)?;
        if !origins.contains(&origin) {
            origins.push(origin);
        }
    }
    Ok(origins)
}

/// The `:check_origin` list: `None` when no extra origins are configured so
/// the default host check applies.
pub fn check_origin(host: &str, value: Option<&str>) -> Result<Option<Vec<String>>, InvalidOrigin> {
    let origins = parse(value)?;
    if origins.is_empty() {
        return Ok(None);
    }
    let mut list = vec![format!("//{host}")];
    list.extend(origins);
    Ok(Some(list))
}

fn normalize(entry: &str) -> Result<String, InvalidOrigin> {
    let origin = entry.trim_end_matches('/').to_lowercase();
    let invalid = || InvalidOrigin(entry.to_owned());
    let (scheme, authority) = origin.split_once("://").ok_or_else(invalid)?;
    if !matches!(scheme, "http" | "https") || authority.contains(['/', '?', '#', '@', ' ']) {
        return Err(invalid());
    }
    let (host, _port) = split_host_port(authority).ok_or_else(invalid)?;
    if host.is_empty() {
        return Err(invalid());
    }
    Ok(origin)
}

/// Splits `host[:port]`; `None` when the port is not a number.
fn split_host_port(authority: &str) -> Option<(&str, Option<u16>)> {
    let (host, port) = if let Some(rest) = authority.strip_prefix('[') {
        let (inside, after) = rest.split_once(']')?;
        let port = match after {
            "" => None,
            other => Some(other.strip_prefix(':')?),
        };
        (inside, port)
    } else {
        match authority.split_once(':') {
            Some((host, port)) => (host, Some(port)),
            None => (authority, None),
        }
    };
    let port = match port {
        None | Some("") => None,
        Some(port) => Some(port.parse::<u16>().ok()?),
    };
    Some((host, port))
}

/// A parsed origin: the port defaults by
/// scheme, and a scheme-relative `//host` matches any scheme and port.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Origin {
    scheme: Option<String>,
    host: Option<String>,
    port: Option<u16>,
}

fn parse_origin(text: &str) -> Origin {
    let (scheme, rest) = match text.split_once("//") {
        Some((scheme, rest)) => (scheme.strip_suffix(':').map(str::to_lowercase), rest),
        None => (None, text),
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    let authority = authority.rsplit('@').next().unwrap_or_default();
    let (host, port) = split_host_port(authority).unwrap_or((authority, None));
    let default_port = match scheme.as_deref() {
        Some("http" | "ws") => Some(80),
        Some("https" | "wss") => Some(443),
        _ => None,
    };
    Origin {
        scheme: scheme.filter(|scheme| !scheme.is_empty()),
        host: Some(host.to_lowercase()).filter(|host| !host.is_empty()),
        port: port.or(default_port),
    }
}

/// Which socket origins the server accepts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OriginPolicy {
    /// `check_origin: false`.
    Any,
    /// `check_origin: true`: the origin host must equal the endpoint host.
    Host(String),
    /// An explicit list.
    List(Vec<String>),
}

impl OriginPolicy {
    /// The policy for a configuration.
    pub fn from_config(config: &Config) -> Result<Self, InvalidOrigin> {
        if config.env == Env::Dev {
            return Ok(Self::Any);
        }
        let host = endpoint_host(config);
        let extra = config.allowed_origins.as_ref().map(|list| list.join(","));
        Ok(match check_origin(&host, extra.as_deref())? {
            Some(list) => Self::List(list),
            None => Self::Host(host),
        })
    }

    /// Whether a request with this `Origin` header may connect. Requests
    /// without an origin are allowed (non-browser clients send none).
    #[must_use]
    pub fn allows(&self, origin: Option<&str>) -> bool {
        let Some(origin) = origin else {
            return true;
        };
        let origin = parse_origin(origin);
        match self {
            Self::Any => true,
            Self::Host(host) => origin.host.as_deref() == Some(host.as_str()),
            Self::List(list) => {
                origin.host.is_some()
                    && list
                        .iter()
                        .map(|allowed| parse_origin(allowed))
                        .any(|allowed| {
                            allowed
                                .scheme
                                .as_ref()
                                .is_none_or(|scheme| origin.scheme.as_ref() == Some(scheme))
                                && allowed.port.is_none_or(|port| origin.port == Some(port))
                                && allowed.host.as_deref().is_none_or(|allowed_host| {
                                    compare_host(
                                        origin.host.as_deref().unwrap_or_default(),
                                        allowed_host,
                                    )
                                })
                        })
            }
        }
    }
}

fn compare_host(request: &str, allowed: &str) -> bool {
    match allowed.strip_prefix("*.") {
        Some(suffix) => request == suffix || request.ends_with(&format!(".{suffix}")),
        None => request == allowed,
    }
}

/// The endpoint's host (`PHX_HOST`), from the public URL.
#[must_use]
pub fn endpoint_host(config: &Config) -> String {
    url::Url::parse(&config.public_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
        .unwrap_or_else(|| "localhost".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOST: &str = "manavault.example.com";

    #[test]
    fn check_origin_returns_none_when_unset_or_blank() {
        assert_eq!(check_origin(HOST, None), Ok(None));
        assert_eq!(check_origin(HOST, Some("")), Ok(None));
        assert_eq!(check_origin(HOST, Some(" , ,  ")), Ok(None));
    }

    #[test]
    fn always_allows_phx_host_ahead_of_the_extra_origins() {
        assert_eq!(
            check_origin(HOST, Some("https://manavault.mytailnet.ts.net")),
            Ok(Some(vec![
                "//manavault.example.com".to_owned(),
                "https://manavault.mytailnet.ts.net".to_owned()
            ]))
        );
    }

    #[test]
    fn parses_origins() {
        assert_eq!(
            parse(Some("https://manavault.mytailnet.ts.net")).unwrap(),
            vec!["https://manavault.mytailnet.ts.net"]
        );
        assert_eq!(
            parse(Some(
                "https://manavault.mytailnet.ts.net,http://manavault.lan:4000"
            ))
            .unwrap(),
            vec![
                "https://manavault.mytailnet.ts.net",
                "http://manavault.lan:4000"
            ]
        );
        assert_eq!(
            parse(Some(
                "  https://Manavault.mytailnet.ts.net/ ,, https://manavault.mytailnet.ts.net ,http://manavault.lan/ "
            ))
            .unwrap(),
            vec!["https://manavault.mytailnet.ts.net", "http://manavault.lan"]
        );
    }

    #[test]
    fn rejects_entries_that_are_not_http_origins() {
        for invalid in [
            "manavault.lan",
            "manavault.lan:4000",
            "ftp://manavault.lan",
            "https://",
            "https://manavault.lan/app",
            "https://manavault.lan?x=1",
            "https://user@manavault.lan",
            "https://manavault.lan:port",
            "not a url",
        ] {
            let error = parse(Some(&format!(
                "https://manavault.mytailnet.ts.net,{invalid}"
            )))
            .expect_err(invalid);
            assert!(
                error
                    .to_string()
                    .contains("MANAVAULT_ALLOWED_ORIGINS has an invalid entry"),
                "{invalid}"
            );
        }
    }

    #[test]
    fn socket_origin_check_accepts_phx_host_and_listed_origins() {
        let list = check_origin(HOST, Some("https://manavault.mytailnet.ts.net"))
            .unwrap()
            .unwrap();
        let policy = OriginPolicy::List(list);
        for origin in [
            "https://manavault.example.com",
            "http://manavault.example.com:4000",
            "https://manavault.mytailnet.ts.net",
        ] {
            assert!(policy.allows(Some(origin)), "{origin}");
        }
        for origin in [
            "https://evil.example.net",
            "http://manavault.mytailnet.ts.net",
            "https://manavault.mytailnet.ts.net:8443",
        ] {
            assert!(!policy.allows(Some(origin)), "{origin}");
        }
        assert!(policy.allows(None));
    }

    #[test]
    fn default_policy_compares_hosts() {
        let policy = OriginPolicy::Host("localhost".to_owned());
        assert!(policy.allows(Some("http://localhost:4000")));
        assert!(policy.allows(Some("https://localhost")));
        assert!(!policy.allows(Some("https://evil.example")));
        assert!(OriginPolicy::Any.allows(Some("https://evil.example")));
    }
}
