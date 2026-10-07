//! The browser session: a [`SessionData`] value kept in a private
//! (encrypted and authenticated) cookie, plus the CSRF token and owner
//! authentication built on it.
//!
//! [`middleware`] decodes the cookie into a request-scoped [`Session`] handle
//! and writes the cookie back when a handler changed it. The owner signs in
//! with a fresh session carrying the fingerprint of the password hash they
//! used, so rotating the hash signs every browser out.

use std::sync::{Arc, Mutex, MutexGuard};

use axum::extract::{FromRequestParts, Request, State};
use axum::http::request::Parts;
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum_extra::extract::cookie::{Cookie, Key, PrivateCookieJar, SameSite};
use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha512};

use crate::crypto;
use crate::state::AppState;

/// The cookie name.
pub const COOKIE_NAME: &str = "manavault_session";

/// The cookie encryption key, derived from the configured secret key.
#[must_use]
pub fn cookie_key(secret: &str) -> Key {
    let mut hasher = Sha512::new();
    hasher.update(b"manavault.session.v1:");
    hasher.update(secret.as_bytes());
    Key::from(&hasher.finalize())
}

/// What the cookie stores.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionData {
    /// The CSRF token, created the first time a page needs one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub csrf_token: Option<String>,
    /// Set once the owner signed in: the fingerprint of the password hash
    /// they signed in with.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner_fingerprint: Option<String>,
}

fn new_csrf_token() -> String {
    URL_SAFE_NO_PAD.encode(crypto::random_bytes::<32>())
}

#[derive(Debug, Default)]
struct Tracked {
    data: SessionData,
    changed: bool,
    dropped: bool,
}

/// The request's session. Changes are written back as a cookie when the
/// response is sent.
#[derive(Clone, Debug, Default)]
pub struct Session(Arc<Mutex<Tracked>>);

impl Session {
    fn lock(&self) -> MutexGuard<'_, Tracked> {
        self.0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    #[must_use]
    pub fn from_data(data: SessionData) -> Self {
        Self(Arc::new(Mutex::new(Tracked {
            data,
            ..Tracked::default()
        })))
    }

    /// A snapshot of the stored values.
    #[must_use]
    pub fn data(&self) -> SessionData {
        self.lock().data.clone()
    }

    /// The CSRF token for a page, created on first use.
    #[must_use]
    pub fn csrf_token(&self) -> String {
        let mut tracked = self.lock();
        if let Some(token) = &tracked.data.csrf_token {
            return token.clone();
        }
        let token = new_csrf_token();
        tracked.data.csrf_token = Some(token.clone());
        tracked.changed = true;
        token
    }

    /// Whether a token from the request is the session's.
    #[must_use]
    pub fn csrf_valid(&self, token: &str) -> bool {
        self.lock()
            .data
            .csrf_token
            .as_deref()
            .is_some_and(|expected| crypto::secure_compare(expected.as_bytes(), token.as_bytes()))
    }

    /// Whether the session belongs to the signed-in owner under the current
    /// password.
    #[must_use]
    pub fn owner_signed_in(&self, state: &AppState) -> bool {
        let Some(hash) = state.config.admin_password_hash.as_deref() else {
            return false;
        };
        let current = crypto::password_fingerprint(hash);
        self.lock()
            .data
            .owner_fingerprint
            .as_deref()
            .is_some_and(|fingerprint| {
                crypto::secure_compare(fingerprint.as_bytes(), current.as_bytes())
            })
    }

    /// Signs the owner in with a fresh session (new CSRF token included).
    pub fn sign_in(&self, state: &AppState) {
        let mut tracked = self.lock();
        tracked.data = SessionData {
            csrf_token: Some(new_csrf_token()),
            owner_fingerprint: state
                .config
                .admin_password_hash
                .as_deref()
                .map(crypto::password_fingerprint),
        };
        tracked.changed = true;
        tracked.dropped = false;
    }

    /// Clears the session and expires the cookie.
    pub fn sign_out(&self) {
        let mut tracked = self.lock();
        tracked.data = SessionData::default();
        tracked.dropped = true;
    }
}

impl<S: Send + Sync> FromRequestParts<S> for Session {
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        parts
            .extensions
            .get::<Session>()
            .cloned()
            .ok_or(StatusCode::INTERNAL_SERVER_ERROR)
    }
}

fn decode(jar: &PrivateCookieJar) -> SessionData {
    jar.get(COOKIE_NAME)
        .and_then(|cookie| serde_json::from_str(cookie.value()).ok())
        .unwrap_or_default()
}

/// Decodes the session from request headers; a missing, tampered, or
/// unreadable cookie is an empty session.
#[must_use]
pub fn load(state: &AppState, headers: &HeaderMap) -> Session {
    Session::from_data(decode(&PrivateCookieJar::from_headers(
        headers,
        state.cookie_key.clone(),
    )))
}

fn session_cookie(state: &AppState, value: String) -> Cookie<'static> {
    Cookie::build((COOKIE_NAME, value))
        .path("/")
        .max_age(time::Duration::days(i64::from(
            state.config.session_max_age_days,
        )))
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(state.config.secure_cookies)
        .build()
}

/// Middleware: loads the session before the handler and writes it back after.
pub async fn middleware(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Response {
    let jar = PrivateCookieJar::from_headers(request.headers(), state.cookie_key.clone());
    let session = Session::from_data(decode(&jar));
    request.extensions_mut().insert(session.clone());
    let response = next.run(request).await;
    let tracked = session.lock();
    if tracked.dropped {
        let removal = Cookie::build(COOKIE_NAME).path("/").build();
        (jar.remove(removal), response).into_response()
    } else if tracked.changed {
        let value = serde_json::to_string(&tracked.data).unwrap_or_default();
        (jar.add(session_cookie(&state, value)), response).into_response()
    } else {
        response
    }
}

/// Whether the request is the owner's: auth disabled, or a signed-in session.
#[must_use]
pub fn authenticated(state: &AppState, session: &Session) -> bool {
    state.config.auth_disabled || session.owner_signed_in(state)
}

/// Middleware for owner-only JSON endpoints.
pub async fn require_api(
    State(state): State<AppState>,
    session: Session,
    request: Request,
    next: Next,
) -> Response {
    if authenticated(&state, &session) {
        next.run(request).await
    } else {
        super::graphql::json_error(StatusCode::UNAUTHORIZED, "Authentication required")
    }
}

/// Middleware for owner-only pages: redirects to the login page with a
/// `return_to` for anything but `/`.
pub async fn require_browser(
    State(state): State<AppState>,
    session: Session,
    request: Request,
    next: Next,
) -> Response {
    if authenticated(&state, &session) {
        return next.run(request).await;
    }
    let path = request
        .uri()
        .path_and_query()
        .map_or("/", axum::http::uri::PathAndQuery::as_str)
        .to_owned();
    let location = if path == "/" {
        "/login".to_owned()
    } else {
        format!(
            "/login?{}",
            url::form_urlencoded::Serializer::new(String::new())
                .append_pair("return_to", &path)
                .finish()
        )
    };
    // Redirects answer 302 Found, as in earlier releases (axum's
    // `Redirect::to` is 303).
    super::redirect(&location)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "UsvngUheE20ovBxVkk8mYUrhf1l5zpBV+Pe5DVeypCZK0QnQde9NDUj1YhFADst6";

    /// Request headers carrying `value` sealed the way a response would send it.
    fn jar_with(key: &Key, value: &str) -> HeaderMap {
        let jar =
            PrivateCookieJar::new(key.clone()).add(Cookie::new(COOKIE_NAME, value.to_owned()));
        let response = (jar, StatusCode::OK).into_response();
        let set_cookie = response.headers()[axum::http::header::SET_COOKIE]
            .to_str()
            .unwrap();
        let pair = set_cookie.split(';').next().unwrap();
        let mut headers = HeaderMap::new();
        headers.insert(axum::http::header::COOKIE, pair.parse().unwrap());
        headers
    }

    #[test]
    fn the_cookie_round_trips_and_rejects_tampering_and_other_keys() {
        let key = cookie_key(SECRET);
        let data = SessionData {
            csrf_token: Some("token".to_owned()),
            owner_fingerprint: Some("fingerprint".to_owned()),
        };
        let encoded = serde_json::to_string(&data).unwrap();
        let headers = jar_with(&key, &encoded);
        let read = |key: &Key, headers: &HeaderMap| {
            PrivateCookieJar::from_headers(headers, key.clone())
                .get(COOKIE_NAME)
                .and_then(|cookie| serde_json::from_str::<SessionData>(cookie.value()).ok())
        };
        assert_eq!(read(&key, &headers), Some(data));
        assert_eq!(read(&cookie_key("other secret"), &headers), None);

        let sealed = headers[axum::http::header::COOKIE]
            .to_str()
            .unwrap()
            .to_owned();
        let tampered = format!("{}x", sealed.trim_end_matches('='));
        let mut headers = HeaderMap::new();
        headers.insert(axum::http::header::COOKIE, tampered.parse().unwrap());
        assert_eq!(read(&key, &headers), None);
    }

    #[test]
    fn csrf_tokens_are_created_once_and_compared_exactly() {
        let session = Session::default();
        let token = session.csrf_token();
        assert_eq!(token.len(), 43);
        assert_eq!(session.csrf_token(), token);
        assert!(session.csrf_valid(&token));
        assert!(!session.csrf_valid(&token[..42]));
        assert!(!session.csrf_valid(&format!("{token}=")));
        assert!(!Session::default().csrf_valid(&token));
    }
}
