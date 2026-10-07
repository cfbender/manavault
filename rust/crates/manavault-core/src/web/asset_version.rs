//! The deploy's asset version (`ManavaultWeb.AssetVersion`), used to bust
//! caches of the shell scripts, stylesheet, manifest, and service worker.

const ENV_VARS: [&str; 4] = [
    "MANAVAULT_ASSET_VERSION",
    "SOURCE_VERSION",
    "GITHUB_SHA",
    "RENDER_GIT_COMMIT",
];

/// The first set variable of `MANAVAULT_ASSET_VERSION`, `SOURCE_VERSION`,
/// `GITHUB_SHA`, `RENDER_GIT_COMMIT`, else the app version; sanitized so it
/// is safe in HTML and JavaScript.
#[must_use]
pub fn current(lookup: impl Fn(&str) -> Option<String>) -> String {
    ENV_VARS
        .iter()
        .find_map(|name| lookup(name).and_then(|value| normalize(&value)))
        .or_else(|| normalize(env!("CARGO_PKG_VERSION")))
        .unwrap_or_else(|| "0".to_owned())
}

/// Trims, keeps the first 40 characters, and replaces anything outside
/// `[A-Za-z0-9._-]` with `-`.
fn normalize(value: &str) -> Option<String> {
    let value: String = value
        .trim()
        .chars()
        .take(40)
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') {
                c
            } else {
                '-'
            }
        })
        .collect();
    (!value.is_empty()).then_some(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn env(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let map: HashMap<String, String> = pairs
            .iter()
            .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
            .collect();
        move |name| map.get(name).cloned()
    }

    #[test]
    fn uses_explicit_asset_version_before_provider_commit() {
        assert_eq!(
            current(env(&[
                ("MANAVAULT_ASSET_VERSION", "release-1"),
                ("GITHUB_SHA", "abcdef1234567890")
            ])),
            "release-1"
        );
    }

    #[test]
    fn uses_provider_commit_sha_when_explicit_version_is_absent() {
        assert_eq!(
            current(env(&[("GITHUB_SHA", "abcdef1234567890")])),
            "abcdef1234567890"
        );
        assert_eq!(current(env(&[])), env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn sanitizes_values() {
        assert_eq!(
            current(env(&[("MANAVAULT_ASSET_VERSION", " abc/def:123<script> ")])),
            "abc-def-123-script-"
        );
        assert_eq!(
            current(env(&[
                ("MANAVAULT_ASSET_VERSION", "   "),
                ("SOURCE_VERSION", "s")
            ])),
            "s"
        );
    }
}
