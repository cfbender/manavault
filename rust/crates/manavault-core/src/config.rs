//! Runtime configuration, read from environment variables. The names from
//! the 1.x releases (`SECRET_KEY_BASE`, `PHX_HOST`) still work and log a
//! deprecation warning.

use std::path::PathBuf;
use std::time::Duration;

/// Which defaults apply. `MANAVAULT_ENV` selects it (`dev`, `test`, or
/// `prod`; default `prod`), mirroring `MIX_ENV`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Env {
    Dev,
    Test,
    Prod,
}

/// A sliding-window rate limit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RateLimit {
    pub window: Duration,
    pub max_per_ip: u32,
    pub max_global: u32,
}

/// Login attempt limits (`:auth_rate_limit`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AuthRateLimit {
    pub limit: RateLimit,
    pub permanent_ban_after_failures: u32,
}

/// Where the scanner model bundle comes from (`SCANNER_BUNDLE_SOURCE`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScannerBundleSource {
    Off,
    Github,
    /// Any other value is treated as a base URL.
    Url(String),
}

#[derive(Debug, Clone)]
pub struct Config {
    pub env: Env,
    pub port: u16,
    pub data_dir: PathBuf,
    pub database_path: PathBuf,
    /// Encrypts session cookies and derives the key for stored credentials
    /// (`MANAVAULT_SECRET_KEY`).
    pub secret_key: String,
    /// Public base URL used for absolute links, from `MANAVAULT_PUBLIC_HOST`.
    pub public_url: String,
    pub admin_password_hash: Option<String>,
    pub auth_disabled: bool,
    pub auth_rate_limit: AuthRateLimit,
    pub public_share_rate_limit: RateLimit,
    pub trust_proxy_headers: bool,
    pub forwarded_ip_header: String,
    pub secure_cookies: bool,
    pub session_max_age_days: u32,
    pub remote_share_allowlist: Vec<String>,
    /// Extra WebSocket origins (`MANAVAULT_ALLOWED_ORIGINS`); `None` keeps the default check.
    pub allowed_origins: Option<Vec<String>>,
    pub scanner_bundle_source: ScannerBundleSource,
    pub scanner_corrections_token: Option<String>,
    /// EDHREC's JSON host (`EDHREC_JSON_BASE_URL`, default
    /// `https://json.edhrec.com`); tests point it at a mock server.
    pub edhrec_json_base_url: String,
    pub scanner_bundle_dir: PathBuf,
    pub scryfall_cache_dir: PathBuf,
    pub scryfall_assets_dir: PathBuf,
    pub share_preview_cache_dir: PathBuf,
    pub backups_dir: PathBuf,
    /// `priv/static`: built frontend assets, icons, and the service worker.
    pub static_dir: PathBuf,
    /// Serve the Vite dev server's module graph instead of the built bundle.
    pub vite_dev_server: bool,
    /// Run background jobs and cron schedules.
    pub jobs_enabled: bool,
    pub pool_size: u32,
    /// Cache-busting version for the shell assets (`ManavaultWeb.AssetVersion`).
    pub asset_version: String,
    /// Android app signing fingerprints for `/.well-known/assetlinks.json`
    /// (`MANAVAULT_ANDROID_CERT_FINGERPRINTS`); empty uses the official one.
    pub android_cert_fingerprints: Vec<String>,
    /// Third-party endpoints used by the platform services (overridden in tests).
    pub platform_urls: PlatformUrls,
    /// EDHREC recs, Recommander, and Commander Spellbook endpoints.
    pub deck_intel: DeckIntelUrls,
}

/// Base URLs of the third-party services the web platform, AI settings,
/// backups, and scanner talk to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlatformUrls {
    pub openrouter_api: String,
    pub google_oauth_token: String,
    pub google_drive_files: String,
    pub google_drive_upload: String,
    pub scanner_releases: String,
    pub star_city_games_affiliate: String,
    /// Moxfield deck API base (linked decks); the deck id is appended.
    pub moxfield_api: String,
    /// Archidekt deck API base (linked decks); `<id>/` is appended.
    pub archidekt_api: String,
}

impl PlatformUrls {
    /// URLs on a closed local port, so a test that forgets to point a client
    /// at a mock server fails instead of reaching the real service.
    #[must_use]
    pub fn unreachable() -> Self {
        let base = "http://127.0.0.1:9";
        Self {
            openrouter_api: format!("{base}/openrouter"),
            google_oauth_token: format!("{base}/google/token"),
            google_drive_files: format!("{base}/google/files"),
            google_drive_upload: format!("{base}/google/upload"),
            scanner_releases: format!("{base}/github/releases"),
            star_city_games_affiliate: format!("{base}/scg/affiliate"),
            moxfield_api: format!("{base}/moxfield/"),
            archidekt_api: format!("{base}/archidekt/"),
        }
    }
}

impl Default for PlatformUrls {
    fn default() -> Self {
        Self {
            openrouter_api: "https://openrouter.ai/api/v1".to_owned(),
            google_oauth_token: "https://oauth2.googleapis.com/token".to_owned(),
            google_drive_files: "https://www.googleapis.com/drive/v3/files".to_owned(),
            google_drive_upload: "https://www.googleapis.com/upload/drive/v3/files".to_owned(),
            scanner_releases:
                "https://api.github.com/repos/cfbender/manavault/releases?per_page=30".to_owned(),
            star_city_games_affiliate: "https://ajax.starcitygames.com/affiliate".to_owned(),
            moxfield_api: lotus::decklist::moxfield::API_BASE.to_owned(),
            archidekt_api: lotus::decklist::archidekt::API_BASE.to_owned(),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("environment variable {0} is missing. {1}")]
    Missing(&'static str, &'static str),
    #[error("environment variable {0} is not a valid number: {1}")]
    Invalid(&'static str, String),
    #[error(transparent)]
    InvalidOrigin(#[from] crate::web::allowed_origins::InvalidOrigin),
}

/// An environment-variable lookup; tests supply their own.
pub trait Lookup {
    fn var(&self, name: &str) -> Option<String>;
}

impl<F: Fn(&str) -> Option<String>> Lookup for F {
    fn var(&self, name: &str) -> Option<String> {
        self(name)
    }
}

/// Variables renamed after the 1.x releases: the old name is read when the
/// new one is unset, with a warning.
const RENAMED: &[(&str, &str)] = &[
    ("MANAVAULT_SECRET_KEY", "SECRET_KEY_BASE"),
    ("MANAVAULT_PUBLIC_HOST", "PHX_HOST"),
];

struct Vars<'a> {
    lookup: &'a dyn Lookup,
    warnings: Vec<String>,
}

impl Vars<'_> {
    fn var(&mut self, name: &str) -> Option<String> {
        if let Some(value) = self.lookup.var(name) {
            return Some(value);
        }
        let (_, old) = RENAMED.iter().find(|(new, _)| *new == name)?;
        let value = self.lookup.var(old)?;
        self.warnings
            .push(format!("{old} is deprecated; set {name} instead"));
        Some(value)
    }

    fn non_blank(&mut self, name: &str) -> Option<String> {
        self.var(name)
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
    }

    fn flag(&mut self, name: &str) -> bool {
        self.var(name).is_some_and(|value| truthy(&value))
    }

    fn number<T: std::str::FromStr>(
        &mut self,
        name: &'static str,
        default: T,
    ) -> Result<T, ConfigError> {
        match self.var(name) {
            None => Ok(default),
            Some(raw) => raw
                .trim()
                .parse()
                .map_err(|_| ConfigError::Invalid(name, raw)),
        }
    }
}

/// `"1"`, `"true"`, `"yes"`, and `"on"` (any case) are true.
#[must_use]
pub fn truthy(value: &str) -> bool {
    matches!(
        value.trim().to_lowercase().as_str(),
        "1" | "true" | "yes" | "on"
    )
}

const DEV_SECRET_KEY: &str = "rXtWSxzpxWwC2Fe3neLd4rTzlXK8pc0usuNiooa0rZnapw8LooU4pavHCYBpx67I";
const TEST_SECRET_KEY: &str = "UsvngUheE20ovBxVkk8mYUrhf1l5zpBV+Pe5DVeypCZK0QnQde9NDUj1YhFADst6";

impl Config {
    /// Reads the configuration from the process environment, logging a
    /// warning for each deprecated variable name in use.
    pub fn from_env() -> Result<Self, ConfigError> {
        let (config, warnings) = Self::read(&|name: &str| std::env::var(name).ok())?;
        for warning in warnings {
            tracing::warn!("{warning}");
        }
        Ok(config)
    }

    /// Reads the configuration from `lookup`, returning it with the
    /// deprecation warnings it raised.
    pub fn read(lookup: &dyn Lookup) -> Result<(Self, Vec<String>), ConfigError> {
        let mut vars = Vars {
            lookup,
            warnings: Vec::new(),
        };
        let config = Self::build(&mut vars)?;
        Ok((config, vars.warnings))
    }

    fn build(vars: &mut Vars<'_>) -> Result<Self, ConfigError> {
        let env = match vars.var("MANAVAULT_ENV").as_deref().map(str::trim) {
            Some("dev") => Env::Dev,
            Some("test") => Env::Test,
            _ => Env::Prod,
        };
        let port = vars.number("PORT", 4000_u16)?;
        let repo_root = PathBuf::from(vars.var("MANAVAULT_ROOT").unwrap_or_else(|| ".".to_owned()));
        let data_dir = PathBuf::from(vars.var("DATA_DIR").unwrap_or_else(|| match env {
            Env::Prod => "/data".to_owned(),
            Env::Dev | Env::Test => repo_root.join("data").display().to_string(),
        }));
        let database_path = PathBuf::from(vars.var("DATABASE_PATH").unwrap_or_else(|| match env {
            Env::Prod => data_dir.join("manavault.db").display().to_string(),
            Env::Dev => repo_root.join("manavault_dev.db").display().to_string(),
            Env::Test => repo_root.join("manavault_test.db").display().to_string(),
        }));

        let secret_key = match (vars.non_blank("MANAVAULT_SECRET_KEY"), env) {
            (Some(secret), _) => secret,
            (None, Env::Dev) => DEV_SECRET_KEY.to_owned(),
            (None, Env::Test) => TEST_SECRET_KEY.to_owned(),
            (None, Env::Prod) => {
                return Err(ConfigError::Missing(
                    "MANAVAULT_SECRET_KEY",
                    "Generate one with: openssl rand -base64 48",
                ));
            }
        };

        let public_url = match (vars.non_blank("MANAVAULT_PUBLIC_HOST"), env) {
            (Some(host), Env::Prod) => format!("https://{host}"),
            (Some(host), _) => format!("http://{host}:{port}"),
            (None, Env::Prod) => {
                return Err(ConfigError::Missing(
                    "MANAVAULT_PUBLIC_HOST",
                    "Set it to the public hostname the app is served from, e.g. MANAVAULT_PUBLIC_HOST=manavault.example.com",
                ));
            }
            (None, _) => format!("http://localhost:{port}"),
        };

        let admin_password_hash = match env {
            Env::Test => None,
            _ => vars.non_blank("MANAVAULT_ADMIN_PASSWORD_HASH"),
        };
        let auth_disabled = match env {
            Env::Test | Env::Dev => true,
            Env::Prod => vars.flag("MANAVAULT_AUTH_DISABLED"),
        };
        if env == Env::Prod && !auth_disabled && admin_password_hash.is_none() {
            return Err(ConfigError::Missing(
                "MANAVAULT_ADMIN_PASSWORD_HASH",
                "Generate one with: manavault hash-password 'your-password'. To run without built-in authentication, set MANAVAULT_AUTH_DISABLED=true.",
            ));
        }

        let auth_rate_limit = AuthRateLimit {
            limit: RateLimit {
                window: Duration::from_secs(
                    vars.number("MANAVAULT_AUTH_RATE_LIMIT_WINDOW_SECONDS", 900_u64)?,
                ),
                max_per_ip: vars.number("MANAVAULT_AUTH_MAX_ATTEMPTS_PER_IP", 5_u32)?,
                max_global: vars.number("MANAVAULT_AUTH_MAX_ATTEMPTS_GLOBAL", 30_u32)?,
            },
            permanent_ban_after_failures: vars
                .number("MANAVAULT_AUTH_PERMANENT_BAN_AFTER_FAILURES", 30_u32)?,
        };
        let public_share_rate_limit = RateLimit {
            window: Duration::from_secs(
                vars.number("MANAVAULT_PUBLIC_SHARE_RATE_LIMIT_WINDOW_SECONDS", 60_u64)?,
            ),
            max_per_ip: vars.number("MANAVAULT_PUBLIC_SHARE_MAX_REQUESTS_PER_IP", 120_u32)?,
            max_global: vars.number("MANAVAULT_PUBLIC_SHARE_MAX_REQUESTS_GLOBAL", 1200_u32)?,
        };

        let remote_share_allowlist = vars
            .var("MANAVAULT_REMOTE_SHARE_ALLOWLIST")
            .unwrap_or_default()
            .split(',')
            .map(str::trim)
            .filter(|entry| !entry.is_empty())
            .map(str::to_owned)
            .collect();
        let allowed_origins = match vars.non_blank("MANAVAULT_ALLOWED_ORIGINS") {
            Some(raw) => Some(crate::web::allowed_origins::parse(Some(&raw))?),
            None => None,
        };

        let scanner_bundle_source = match vars
            .var("SCANNER_BUNDLE_SOURCE")
            .unwrap_or_else(|| {
                if env == Env::Test {
                    "off".to_owned()
                } else {
                    "github".to_owned()
                }
            })
            .trim()
        {
            "off" | "" => ScannerBundleSource::Off,
            "github" => ScannerBundleSource::Github,
            other => ScannerBundleSource::Url(other.to_owned()),
        };

        let static_dir = PathBuf::from(
            vars.var("MANAVAULT_STATIC_DIR")
                .unwrap_or_else(|| repo_root.join("priv/static").display().to_string()),
        );
        let share_preview_cache_dir = PathBuf::from(
            vars.var("SHARE_PREVIEW_CACHE_DIR")
                .unwrap_or_else(|| data_dir.join("cache/share-previews").display().to_string()),
        );

        Ok(Self {
            env,
            port,
            scanner_bundle_dir: data_dir.join("scanner"),
            scryfall_cache_dir: data_dir.join("cache/scryfall"),
            scryfall_assets_dir: data_dir.join("cache/scryfall/assets"),
            backups_dir: data_dir.join("backups"),
            share_preview_cache_dir,
            data_dir,
            database_path,
            secret_key,
            public_url,
            admin_password_hash,
            auth_disabled,
            auth_rate_limit,
            public_share_rate_limit,
            trust_proxy_headers: vars.flag("MANAVAULT_TRUST_PROXY_HEADERS"),
            forwarded_ip_header: vars
                .var("MANAVAULT_FORWARDED_IP_HEADER")
                .unwrap_or_else(|| "x-forwarded-for".to_owned())
                .to_lowercase(),
            secure_cookies: vars.flag("MANAVAULT_SECURE_COOKIES"),
            session_max_age_days: vars.number("MANAVAULT_SESSION_MAX_AGE_DAYS", 180_u32)?,
            remote_share_allowlist,
            allowed_origins,
            scanner_bundle_source,
            scanner_corrections_token: vars.non_blank("SCANNER_CORRECTIONS_TOKEN"),
            edhrec_json_base_url: vars
                .non_blank("EDHREC_JSON_BASE_URL")
                .unwrap_or_else(|| EDHREC_JSON_BASE_URL.to_owned()),
            static_dir,
            vite_dev_server: env == Env::Dev && !vars.flag("MANAVAULT_VITE_DISABLED"),
            jobs_enabled: env != Env::Test && !vars.flag("MANAVAULT_JOBS_DISABLED"),
            pool_size: vars.number("POOL_SIZE", 5_u32)?,
            asset_version: crate::web::asset_version::current(|name| vars.lookup.var(name)),
            android_cert_fingerprints: vars
                .var("MANAVAULT_ANDROID_CERT_FINGERPRINTS")
                .unwrap_or_default()
                .split([',', '\n', ' '])
                .map(str::trim)
                .filter(|entry| !entry.is_empty())
                .map(str::to_owned)
                .collect(),
            platform_urls: PlatformUrls::default(),
            deck_intel: DeckIntelUrls::default(),
        })
    }

    /// Configuration for tests: auth disabled, jobs off, temporary directories.
    #[must_use]
    pub fn for_tests(data_dir: PathBuf) -> Self {
        let limit = RateLimit {
            window: Duration::from_secs(60),
            max_per_ip: 120,
            max_global: 1200,
        };
        Self {
            env: Env::Test,
            port: 4002,
            database_path: data_dir.join("test.db"),
            scanner_bundle_dir: data_dir.join("scanner"),
            scryfall_cache_dir: data_dir.join("cache/scryfall"),
            scryfall_assets_dir: data_dir.join("cache/scryfall/assets"),
            share_preview_cache_dir: data_dir.join("cache/share-previews"),
            backups_dir: data_dir.join("backups"),
            static_dir: data_dir.join("static"),
            data_dir,
            secret_key: TEST_SECRET_KEY.to_owned(),
            public_url: "http://localhost:4002".to_owned(),
            admin_password_hash: None,
            auth_disabled: true,
            auth_rate_limit: AuthRateLimit {
                limit: RateLimit {
                    window: Duration::from_secs(900),
                    max_per_ip: 5,
                    max_global: 30,
                },
                permanent_ban_after_failures: 30,
            },
            public_share_rate_limit: limit,
            trust_proxy_headers: false,
            forwarded_ip_header: "x-forwarded-for".to_owned(),
            secure_cookies: false,
            session_max_age_days: 180,
            remote_share_allowlist: Vec::new(),
            allowed_origins: None,
            scanner_bundle_source: ScannerBundleSource::Off,
            scanner_corrections_token: None,
            edhrec_json_base_url: EDHREC_JSON_BASE_URL.to_owned(),
            vite_dev_server: false,
            jobs_enabled: false,
            pool_size: 1,
            asset_version: "test-asset-version".to_owned(),
            android_cert_fingerprints: Vec::new(),
            platform_urls: PlatformUrls::unreachable(),
            deck_intel: DeckIntelUrls::unreachable(),
        }
    }

    /// Directories the app writes to; created at startup.
    #[must_use]
    pub fn writable_dirs(&self) -> Vec<PathBuf> {
        let mut dirs = vec![
            self.data_dir.clone(),
            self.scryfall_cache_dir.clone(),
            self.scryfall_assets_dir.clone(),
            self.scanner_bundle_dir.clone(),
            self.share_preview_cache_dir.clone(),
            self.backups_dir.clone(),
        ];
        if let Some(parent) = self.database_path.parent() {
            dirs.push(parent.to_path_buf());
        }
        dirs
    }
}

/// The public EDHREC JSON host; card pages live under `/pages/cards`.
pub const EDHREC_JSON_BASE_URL: &str = "https://json.edhrec.com";

/// Third-party endpoints for deck features (overridden in tests). EDHREC
/// commander pages use `Config::edhrec_json_base_url`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckIntelUrls {
    /// EDHREC's deck recommendation endpoint (`EDHRec.Client` `@recs_url`).
    pub edhrec_recs: String,
    /// Recommander's top-recommendations endpoint.
    pub recommander: String,
    /// Commander Spellbook's find-my-combos endpoint, with its query string.
    pub commander_spellbook: String,
}

impl Default for DeckIntelUrls {
    fn default() -> Self {
        Self {
            edhrec_recs: "https://edhrec.com/api/recs".to_owned(),
            recommander: "https://api.recommander.cards/public-release/api/decks/recommend/top"
                .to_owned(),
            commander_spellbook:
                "https://backend.commanderspellbook.com/find-my-combos/?limit=1000".to_owned(),
        }
    }
}

impl DeckIntelUrls {
    /// URLs on a closed local port, so a test that forgets to point a client
    /// at a mock server fails instead of reaching the real service.
    #[must_use]
    pub fn unreachable() -> Self {
        let base = "http://127.0.0.1:9";
        Self {
            edhrec_recs: format!("{base}/edhrec/recs"),
            recommander: format!("{base}/recommander"),
            commander_spellbook: format!("{base}/spellbook"),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;

    fn read(vars: &[(&str, &str)]) -> Result<(Config, Vec<String>), ConfigError> {
        let vars: HashMap<String, String> = vars
            .iter()
            .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
            .collect();
        Config::read(&|name: &str| vars.get(name).cloned())
    }

    #[test]
    fn production_reads_the_current_names_without_warnings() {
        let (config, warnings) = read(&[
            ("MANAVAULT_SECRET_KEY", "new-secret"),
            ("MANAVAULT_PUBLIC_HOST", "vault.example"),
            ("MANAVAULT_AUTH_DISABLED", "true"),
        ])
        .unwrap();
        assert_eq!(config.secret_key, "new-secret");
        assert_eq!(config.public_url, "https://vault.example");
        assert!(warnings.is_empty(), "{warnings:?}");
    }

    #[test]
    fn the_1x_names_still_work_and_warn() {
        let (config, warnings) = read(&[
            ("SECRET_KEY_BASE", "old-secret"),
            ("PHX_HOST", "vault.example"),
            ("MANAVAULT_AUTH_DISABLED", "true"),
        ])
        .unwrap();
        assert_eq!(config.secret_key, "old-secret");
        assert_eq!(config.public_url, "https://vault.example");
        assert_eq!(
            warnings,
            [
                "SECRET_KEY_BASE is deprecated; set MANAVAULT_SECRET_KEY instead",
                "PHX_HOST is deprecated; set MANAVAULT_PUBLIC_HOST instead",
            ]
        );
    }

    #[test]
    fn the_current_name_wins_over_the_old_one() {
        let (config, warnings) = read(&[
            ("MANAVAULT_SECRET_KEY", "new-secret"),
            ("SECRET_KEY_BASE", "old-secret"),
            ("MANAVAULT_PUBLIC_HOST", "vault.example"),
            ("MANAVAULT_AUTH_DISABLED", "true"),
        ])
        .unwrap();
        assert_eq!(config.secret_key, "new-secret");
        assert!(warnings.is_empty(), "{warnings:?}");
    }

    #[test]
    fn production_requires_the_secret_and_host() {
        let error = read(&[("MANAVAULT_AUTH_DISABLED", "true")]).unwrap_err();
        assert!(
            error
                .to_string()
                .starts_with("environment variable MANAVAULT_SECRET_KEY is missing")
        );
        let error = read(&[
            ("MANAVAULT_SECRET_KEY", "secret"),
            ("MANAVAULT_AUTH_DISABLED", "true"),
        ])
        .unwrap_err();
        assert!(
            error
                .to_string()
                .starts_with("environment variable MANAVAULT_PUBLIC_HOST is missing")
        );
    }
}
