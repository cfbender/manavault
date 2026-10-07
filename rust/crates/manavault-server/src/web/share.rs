//! Hook for the public share pages (`AppController.share_deck`,
//! `share_wants`, `share_binder`, `share_deck_preview_image`,
//! `share_deck_preview_png`) and the public share GraphQL endpoint.
//!
//! The deck and trade modules fill these in:
//!
//! - [`browser_routes`]: `GET /share/decks/:token`, `/share/wants/:token`,
//!   `/share/binder/:token`. They run in the `:browser` pipeline (session,
//!   CSRF, secure headers) without owner authentication, and render the shell
//!   with [`super::app_shell::render_app`] and a deck-specific
//!   [`super::app_shell::SharePreview`] (or answer 404 for invalid tokens).
//! - [`public_routes`]: `GET /share/decks/:token/preview.svg` and
//!   `preview.png`, outside any pipeline.
//! - [`graphql_route`]: `/share/graphql`; the router wraps it in
//!   [`super::public_graphql::admit`] and [`super::public_graphql::validate`]
//!   (the parsed body is then available as [`super::params::Params`], and
//!   [`super::graphql_http::execute`] runs it against the public schema).

use axum::Router;
use axum::routing::MethodRouter;

use super::WebState;

/// Adds the share shell routes to the `:browser` router.
pub fn browser_routes(router: Router<WebState>) -> Router<WebState> {
    router
}

/// Adds the share preview image routes (no pipeline).
pub fn public_routes(router: Router<WebState>) -> Router<WebState> {
    router
}

/// The `/share/graphql` handler, once the public schema exists.
#[must_use]
pub fn graphql_route() -> Option<MethodRouter<WebState>> {
    None
}
