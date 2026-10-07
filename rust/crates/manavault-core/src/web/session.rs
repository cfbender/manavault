//! The `_manavault_key` cookie session, compatible with Plug's signed
//! cookie store, plus CSRF tokens and owner authentication.

use std::sync::{Arc, Mutex, MutexGuard};

use axum::extract::{FromRequestParts, Request, State};
use axum::http::header::{COOKIE, SET_COOKIE};
use axum::http::request::Parts;
use axum::http::{HeaderValue, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::crypto::{self, Session as SessionMap, SessionValue, csrf};
use crate::state::AppState;

/// The cookie name (`ManavaultWeb.SessionOptions`).
pub const COOKIE_NAME: &str = "_manavault_key";
const AUTHENTICATED_KEY: &str = "manavault_authenticated";
const FINGERPRINT_KEY: &str = "manavault_auth_fingerprint";

#[derive(Debug, Default)]
struct SessionData {
    values: SessionMap,
    changed: bool,
    dropped: bool,
}

/// The request's session. Changes are written back as a cookie when the
/// response is sent.
#[derive(Clone, Debug, Default)]
pub struct Session(Arc<Mutex<SessionData>>);

impl Session {
    fn lock(&self) -> MutexGuard<'_, SessionData> {
        self.0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    #[must_use]
    pub fn from_values(values: SessionMap) -> Self {
        Self(Arc::new(Mutex::new(SessionData {
            values,
            ..SessionData::default()
        })))
    }

    #[must_use]
    pub fn get(&self, key: &str) -> Option<SessionValue> {
        self.lock().values.get(key).cloned()
    }

    #[must_use]
    pub fn get_text(&self, key: &str) -> Option<String> {
        match self.get(key) {
            Some(SessionValue::Text(text)) => Some(text),
            _ => None,
        }
    }

    pub fn put(&self, key: &str, value: SessionValue) {
        let mut data = self.lock();
        data.values.insert(key.to_owned(), value);
        data.changed = true;
    }

    pub fn delete(&self, key: &str) {
        let mut data = self.lock();
        if data.values.remove(key).is_some() {
            data.changed = true;
        }
    }

    /// Clears the session and expires the cookie.
    pub fn drop_session(&self) {
        let mut data = self.lock();
        data.values.clear();
        data.dropped = true;
    }

    /// Replaces every value (`clear_session` + `put_session`).
    pub fn replace(&self, values: SessionMap) {
        let mut data = self.lock();
        data.values = values;
        data.changed = true;
        data.dropped = false;
    }

    #[must_use]
    pub fn values(&self) -> SessionMap {
        self.lock().values.clone()
    }

    /// The masked CSRF token for a page, creating the session token if needed
    /// (`Plug.CSRFProtection.get_csrf_token/0`).
    #[must_use]
    pub fn csrf_token(&self) -> String {
        let token = match self.get_text(csrf::SESSION_KEY) {
            Some(token) if token.len() == 24 => token,
            _ => {
                let token = csrf::generate();
                self.put(csrf::SESSION_KEY, SessionValue::Text(token.clone()));
                token
            }
        };
        csrf::mask(&token)
    }

    /// Whether a masked token from the request matches the session.
    #[must_use]
    pub fn csrf_valid(&self, masked: &str) -> bool {
        self.get_text(csrf::SESSION_KEY)
            .is_some_and(|token| csrf::valid(&token, masked))
    }

    /// Whether the session belongs to the signed-in owner under the current
    /// password (`Plugs.Authentication.session_authenticated?/1`).
    #[must_use]
    pub fn owner_signed_in(&self, state: &AppState) -> bool {
        let Some(hash) = state.config.admin_password_hash.as_deref() else {
            return false;
        };
        let current = crypto::password_fingerprint(hash);
        self.get(AUTHENTICATED_KEY) == Some(SessionValue::Bool(true))
            && self.get_text(FINGERPRINT_KEY).is_some_and(|fingerprint| {
                crypto::secure_compare(fingerprint.as_bytes(), current.as_bytes())
            })
    }

    /// Signs the owner in with a fresh session (`Authentication.sign_in/1`).
    pub fn sign_in(&self, state: &AppState) {
        let mut values = SessionMap::new();
        values.insert(AUTHENTICATED_KEY.to_owned(), SessionValue::Bool(true));
        if let Some(hash) = state.config.admin_password_hash.as_deref() {
            values.insert(
                FINGERPRINT_KEY.to_owned(),
                SessionValue::Text(crypto::password_fingerprint(hash)),
            );
        }
        self.replace(values);
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

/// Reads a cookie from the request headers.
#[must_use]
pub fn cookie_value(headers: &axum::http::HeaderMap, name: &str) -> Option<String> {
    headers
        .get_all(COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .filter_map(|pair| pair.trim().split_once('='))
        .find(|(key, _)| *key == name)
        .map(|(_, value)| value.to_owned())
}

/// Decodes the session from request headers.
#[must_use]
pub fn load(state: &AppState, headers: &axum::http::HeaderMap) -> Session {
    let values = cookie_value(headers, COOKIE_NAME)
        .and_then(|cookie| state.sessions.decode(&cookie))
        .unwrap_or_default();
    Session::from_values(values)
}

fn set_cookie_header(state: &AppState, value: &str, max_age: i64) -> Option<HeaderValue> {
    let mut cookie =
        format!("{COOKIE_NAME}={value}; path=/; max-age={max_age}; HttpOnly; SameSite=Lax");
    if state.config.secure_cookies {
        cookie.push_str("; secure");
    }
    HeaderValue::from_str(&cookie).ok()
}

/// Middleware: loads the session before the handler and writes it back after.
pub async fn middleware(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Response {
    let session = load(&state, request.headers());
    request.extensions_mut().insert(session.clone());
    let mut response = next.run(request).await;
    let data = session.lock();
    let header = if data.dropped {
        set_cookie_header(&state, "", 0)
    } else if data.changed {
        let max_age = i64::from(state.config.session_max_age_days) * 86_400;
        set_cookie_header(&state, &state.sessions.encode(&data.values), max_age)
    } else {
        None
    };
    if let Some(header) = header {
        response.headers_mut().append(SET_COOKIE, header);
    }
    response
}

/// Whether the request is the owner's: auth disabled, or a signed-in session.
#[must_use]
pub fn authenticated(state: &AppState, session: &Session) -> bool {
    state.config.auth_disabled || session.owner_signed_in(state)
}

fn json_error(status: StatusCode, message: &str) -> Response {
    (
        status,
        axum::Json(serde_json::json!({"errors": [{"message": message}]})),
    )
        .into_response()
}

/// Middleware for owner-only JSON endpoints (`Authentication, :api`).
pub async fn require_api(
    State(state): State<AppState>,
    session: Session,
    request: Request,
    next: Next,
) -> Response {
    if authenticated(&state, &session) {
        next.run(request).await
    } else {
        json_error(StatusCode::UNAUTHORIZED, "Authentication required")
    }
}

/// Middleware for owner-only pages (`Authentication, :browser`): redirects to
/// the login page with a `return_to` for anything but `/`.
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

/// Middleware for the GraphQL endpoint (`GraphQLCSRFProtection`): POST only,
/// with a valid masked CSRF token in `x-csrf-token` or the `_csrf_token` param.
pub async fn require_csrf_post(session: Session, request: Request, next: Next) -> Response {
    if request.method() != axum::http::Method::POST {
        let mut response = json_error(StatusCode::METHOD_NOT_ALLOWED, "Method not allowed");
        response
            .headers_mut()
            .insert(axum::http::header::ALLOW, HeaderValue::from_static("POST"));
        return response;
    }
    let header_ok = request
        .headers()
        .get_all("x-csrf-token")
        .iter()
        .filter_map(|value| value.to_str().ok())
        .any(|token| session.csrf_valid(token));
    let query_ok = request.uri().query().is_some_and(|query| {
        url::form_urlencoded::parse(query.as_bytes())
            .any(|(key, value)| key == "_csrf_token" && session.csrf_valid(&value))
    });
    if header_ok || query_ok {
        next.run(request).await
    } else {
        json_error(StatusCode::FORBIDDEN, "Invalid CSRF token")
    }
}
