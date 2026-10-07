//! HTTP tests through the full router: routes whose behavior comes from the
//! server's middleware (sessions, CSRF, rate limiting, static files) rather
//! than from one domain crate.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::indexing_slicing,
    clippy::panic
)]

mod scryfall_assets;
mod share;
mod trade_pages;
