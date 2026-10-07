//! `/login` and `/logout`.

use axum::extract::{Form, FromRequest as _, Query, State};
use axum::http::header::{CONTENT_TYPE, RETRY_AFTER};
use axum::http::{HeaderValue, Request, StatusCode};
use axum::response::{IntoResponse, Response};

use super::app_shell::escape;
use super::client_ip;
use super::return_path;
use super::session::{self, Session};
use crate::auth::{self, Check, FailureOutcome};
use crate::state::AppState;

const MISSING_HASH: &str = "Admin password hash is missing. Set MANAVAULT_ADMIN_PASSWORD_HASH or explicitly disable auth with MANAVAULT_AUTH_DISABLED=true.";
const PERMANENTLY_BANNED: &str =
    "Too many incorrect password attempts. This client is permanently blocked.";

pub use manavault_core::web::redirect;

fn login_page(csrf_token: &str, return_to: &str, error: Option<&str>) -> String {
    let error = error.map_or_else(String::new, |error| {
        format!("<p class=\"error\" role=\"alert\">{}</p>", escape(error))
    });
    format!(
        r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>Sign in · ManaVault</title>
    <link rel="stylesheet" href="/shell/css/login.css" />
  </head>
  <body>
    <div class="shell">
      <a class="brand" href="/">
        <img src="/images/logo.png" alt="" />
        <span>ManaVault</span>
      </a>
      <main>
        <section class="hero" aria-labelledby="login-title">
          <p class="eyebrow">Owner access</p>
          <h1 id="login-title">Your Magic vault, secured.</h1>
          <p class="lede">Sign in to manage your collection, decks, backups, and local card catalog.</p>
        </section>
        <form class="card" method="post" action="/login">
          {error}
          <input type="hidden" name="_csrf_token" value="{csrf}" />
          <input type="hidden" name="return_to" value="{return_to}" />
          <label>
            Password
            <input name="password" type="password" autocomplete="current-password" required autofocus />
          </label>
          <button type="submit">Sign in</button>
        </form>
      </main>
    </div>
  </body>
</html>
"#,
        csrf = escape(csrf_token),
        return_to = escape(return_to),
    )
}

fn render_login(
    session: &Session,
    status: StatusCode,
    return_to: Option<&str>,
    error: Option<&str>,
) -> Response {
    let return_to = return_path::sanitize(return_to);
    (
        status,
        [(CONTENT_TYPE, "text/html; charset=utf-8")],
        login_page(&session.csrf_token(), &return_to, error),
    )
        .into_response()
}

/// The login page's query string.
#[derive(Debug, Default, serde::Deserialize)]
pub struct LoginQuery {
    return_to: Option<String>,
}

/// The login form's fields.
#[derive(Debug, Default, serde::Deserialize)]
pub struct LoginForm {
    password: Option<String>,
    return_to: Option<String>,
}

/// `GET /login`.
pub async fn new(
    State(state): State<AppState>,
    session: Session,
    Query(query): Query<LoginQuery>,
) -> Response {
    let return_to = query.return_to.as_deref();
    if auth::disabled(&state.config) || session::authenticated(&state, &session) {
        return redirect(&return_path::sanitize(return_to));
    }
    if !auth::configured(&state.config) {
        return render_login(
            &session,
            StatusCode::SERVICE_UNAVAILABLE,
            return_to,
            Some(MISSING_HASH),
        );
    }
    render_login(&session, StatusCode::OK, return_to, None)
}

fn rate_limited_message(retry_after: u64) -> String {
    if retry_after < 120 {
        format!("Too many incorrect password attempts. Try again in {retry_after} seconds.")
    } else {
        let minutes = retry_after.div_ceil(60);
        format!("Too many incorrect password attempts. Try again in {minutes} minutes.")
    }
}

fn server_error(error: &sqlx::Error) -> Response {
    tracing::error!(%error, "login failed");
    (StatusCode::INTERNAL_SERVER_ERROR, "Internal Server Error").into_response()
}

/// `POST /login`.
pub async fn create(
    State(state): State<AppState>,
    session: Session,
    request: Request<axum::body::Body>,
) -> Response {
    let client_id = client_ip::for_request(&state.config, &request);
    let form = match Form::<LoginForm>::from_request(request, &()).await {
        Ok(Form(form)) => form,
        Err(rejection) => return rejection.into_response(),
    };
    let Some(password) = form.password.as_deref() else {
        return render_login(
            &session,
            StatusCode::BAD_REQUEST,
            form.return_to.as_deref(),
            Some("Password is required"),
        );
    };
    let return_to = return_path::sanitize(form.return_to.as_deref());
    if auth::disabled(&state.config) {
        return redirect(&return_to);
    }
    if !auth::configured(&state.config) {
        return render_login(
            &session,
            StatusCode::SERVICE_UNAVAILABLE,
            Some(&return_to),
            Some(MISSING_HASH),
        );
    }

    let limits = state.config.auth_rate_limit;
    match state
        .login_attempts
        .check(&state.db, &limits, &client_id)
        .await
    {
        Err(error) => server_error(&error),
        Ok(Check::PermanentlyBanned) => render_login(
            &session,
            StatusCode::FORBIDDEN,
            Some(&return_to),
            Some(PERMANENTLY_BANNED),
        ),
        Ok(Check::RateLimited(retry_after)) => {
            let mut response = render_login(
                &session,
                StatusCode::TOO_MANY_REQUESTS,
                Some(&return_to),
                Some(&rate_limited_message(retry_after)),
            );
            response
                .headers_mut()
                .insert(RETRY_AFTER, HeaderValue::from(retry_after));
            response
        }
        Ok(Check::Ok) => {
            if auth::verify_admin_password(&state.config, password) {
                if let Err(error) = state.login_attempts.reset(&state.db, &client_id).await {
                    return server_error(&error);
                }
                session.sign_in(&state);
                redirect(&return_to)
            } else {
                match state
                    .login_attempts
                    .record_failure(&state.db, &limits, &client_id)
                    .await
                {
                    Err(error) => server_error(&error),
                    Ok(FailureOutcome::Banned) => render_login(
                        &session,
                        StatusCode::FORBIDDEN,
                        Some(&return_to),
                        Some(PERMANENTLY_BANNED),
                    ),
                    Ok(FailureOutcome::Ok) => render_login(
                        &session,
                        StatusCode::UNAUTHORIZED,
                        Some(&return_to),
                        Some("Incorrect password"),
                    ),
                }
            }
        }
    }
}

/// `POST /logout`: drops the whole session.
pub async fn delete(session: Session) -> Response {
    session.drop_session();
    redirect("/login")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_limit_messages_switch_to_minutes() {
        assert_eq!(
            rate_limited_message(60),
            "Too many incorrect password attempts. Try again in 60 seconds."
        );
        assert_eq!(
            rate_limited_message(121),
            "Too many incorrect password attempts. Try again in 3 minutes."
        );
    }
}
