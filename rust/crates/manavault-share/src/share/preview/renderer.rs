//! Rasterizes the preview SVG (`DeckSharePreview.Renderer`).
//!
//! Earlier releases wrote the SVG to a temporary file and ran the `resvg`
//! CLI (`--width=1200 --height=630 --sans-serif-family="DejaVu Sans"`).
//! This uses the same resvg release as a library, in process, with system
//! fonts and `DejaVu Sans` as the `sans-serif` family. Mana symbols are
//! embedded as data URIs from the synced Scryfall assets.

use std::path::Path;
use std::sync::{Arc, LazyLock};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use resvg::{tiny_skia, usvg};

use super::{DeckPreview, IMAGE_HEIGHT, IMAGE_WIDTH, mana_symbol_url, symbol_code};

/// The renderer identity in artifact fingerprints.
pub const RENDERER_VERSION: &str = "resvg-0.48.1";
const SANS_SERIF_FAMILY: &str = "DejaVu Sans";

/// Why rendering failed.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum RenderError {
    /// `:renderer_unavailable`.
    #[error("renderer_unavailable")]
    RendererUnavailable,
    /// `:render_failed`.
    #[error("render_failed")]
    RenderFailed,
}

static FONTS: LazyLock<Arc<usvg::fontdb::Database>> = LazyLock::new(|| {
    let mut fonts = usvg::fontdb::Database::new();
    fonts.load_system_fonts();
    fonts.set_sans_serif_family(SANS_SERIF_FAMILY);
    Arc::new(fonts)
});

/// `mana_symbol_data_uri/1`: the local symbol SVG as a data URI, else its
/// `/scryfall-assets` URL.
#[must_use]
pub fn mana_symbol_data_uri(assets_dir: &Path, color: &str) -> String {
    let filename = format!("{}.svg", symbol_code(color));
    crate::scryfall_assets::local_path(assets_dir, &["symbols", &filename])
        .and_then(|path| std::fs::read(path).ok())
        .map_or_else(
            || mana_symbol_url(color),
            |svg| format!("data:image/svg+xml;base64,{}", STANDARD.encode(svg)),
        )
}

/// Renders an SVG document to a 1200×630 PNG.
pub fn render_svg(svg: &str) -> Result<Vec<u8>, RenderError> {
    let options = usvg::Options {
        fontdb: FONTS.clone(),
        ..usvg::Options::default()
    };
    let tree = usvg::Tree::from_str(svg, &options).map_err(|_| RenderError::RenderFailed)?;
    let mut pixmap = tiny_skia::Pixmap::new(IMAGE_WIDTH, IMAGE_HEIGHT)
        .ok_or(RenderError::RendererUnavailable)?;
    // The document is 1200×630 already, so no scaling is needed.
    resvg::render(&tree, tiny_skia::Transform::default(), &mut pixmap.as_mut());
    pixmap.encode_png().map_err(|_| RenderError::RenderFailed)
}

/// `Renderer.render/1`: the preview with embedded symbols, rendered off the
/// async runtime.
pub async fn render(preview: &DeckPreview, assets_dir: &Path) -> Result<Vec<u8>, RenderError> {
    let svg = preview.svg_with(&|color| mana_symbol_data_uri(assets_dir, color));
    tokio::task::spawn_blocking(move || render_svg(&svg))
        .await
        .map_err(|_| RenderError::RendererUnavailable)?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn renders_a_1200_by_630_png_with_embedded_symbols() {
        let assets = crate::test_support::TempDir::new();
        let symbols = crate::scryfall_assets::symbols_dir(assets.path());
        std::fs::create_dir_all(&symbols).unwrap();
        std::fs::write(
            symbols.join("W.svg"),
            r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#fff"/></svg>"##,
        )
        .unwrap();
        assert!(mana_symbol_data_uri(assets.path(), "w").starts_with("data:image/svg+xml;base64,"));
        assert_eq!(
            mana_symbol_data_uri(assets.path(), "U"),
            "/scryfall-assets/symbols/U.svg"
        );
        let preview = DeckPreview {
            token: None,
            deck_name: "Render Test".into(),
            image_alt: "Preview for Render Test".into(),
            cover_image_url: None,
            format_label: "Commander".into(),
            status_label: "Active".into(),
            card_count_label: "100 cards".into(),
            bracket_label: Some("Bracket 3".into()),
            legality_label: "Illegal".into(),
            price_label: Some("$12.50".into()),
            color_identity: vec!["W".into(), "U".into()],
        };
        let png = render(&preview, assets.path()).await.unwrap();
        assert_eq!(png.get(..8).unwrap(), b"\x89PNG\r\n\x1a\n");
        assert_eq!(png.get(12..16).unwrap(), b"IHDR");
        assert_eq!(
            u32::from_be_bytes(png.get(16..20).unwrap().try_into().unwrap()),
            1200
        );
        assert_eq!(
            u32::from_be_bytes(png.get(20..24).unwrap().try_into().unwrap()),
            630
        );
        assert_eq!(render_svg("not svg"), Err(RenderError::RenderFailed));
    }
}
