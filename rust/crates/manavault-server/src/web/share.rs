//! The public share routes:
//!
//! - [`browser_routes`]: `GET /share/decks/:token`, `/share/wants/:token`,
//!   `/share/binder/:token`, in the browser pipeline (session, CSRF, secure
//!   headers) without owner authentication. They render the shell with
//!   [`manavault_core::web::app_shell::render_app`] or answer an empty 404.
//! - [`public_routes`]: `GET /share/decks/:token/preview.svg` and
//!   `preview.png`, outside any pipeline.
//! - [`graphql_route`]: `POST /share/graphql`; the router wraps it in
//!   [`manavault_core::web::public_graphql::admit`] and [`manavault_core::web::graphql::require_json`],
//!   and [`manavault_share::share::http`] runs it against the public schema.

use axum::Router;
use axum::routing::{MethodRouter, post};

use super::WebState;

/// Adds the share shell routes to the `:browser` router.
pub fn browser_routes(router: Router<WebState>) -> Router<WebState> {
    manavault_share::share::pages::browser_routes(manavault_trade::trade::web::routes(router))
}

/// Adds the share preview image routes (no pipeline).
pub fn public_routes(router: Router<WebState>) -> Router<WebState> {
    manavault_share::share::pages::public_routes(router)
}

/// The `/share/graphql` handler.
#[must_use]
pub fn graphql_route() -> MethodRouter<WebState> {
    post(manavault_share::share::http::handler)
}
