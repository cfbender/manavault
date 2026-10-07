//! The public share routes:
//!
//! - [`browser_routes`]: `GET /share/decks/:token`, `/share/wants/:token`,
//!   `/share/binder/:token`, in the browser pipeline (session, CSRF, secure
//!   headers) without owner authentication. They render the shell with
//!   [`super::app_shell::render_app`] or answer an empty 404.
//! - [`public_routes`]: `GET /share/decks/:token/preview.svg` and
//!   `preview.png`, outside any pipeline.
//! - [`graphql_route`]: `POST /share/graphql`; the router wraps it in
//!   [`super::public_graphql::admit`] and [`super::graphql::require_json`],
//!   and [`crate::share::http`] runs it against the public schema.

use axum::Router;
use axum::routing::{MethodRouter, post};

use super::WebState;

/// Adds the share shell routes to the `:browser` router.
pub fn browser_routes(router: Router<WebState>) -> Router<WebState> {
    crate::share::pages::browser_routes(crate::trade::web::routes(router))
}

/// Adds the share preview image routes (no pipeline).
pub fn public_routes(router: Router<WebState>) -> Router<WebState> {
    crate::share::pages::public_routes(router)
}

/// The `/share/graphql` handler.
#[must_use]
pub fn graphql_route() -> MethodRouter<WebState> {
    post(crate::share::http::handler)
}
