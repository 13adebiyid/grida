//! Vector-export image draw recording.
//!
//! Skia's `SkSVGDevice` serializes every direct image draw by decoding the
//! image and re-encoding it as a full-resolution PNG (`drawBitmapCommon` →
//! `EncodePng`) — for photographic JPEGs that is a ~6-8x payload
//! amplification plus a multi-second decode+encode stall per export. The
//! device also drops paint fidelity on image draws: alpha serializes as
//! `fill-opacity` (a no-op on raster `<image>` references), and blend modes
//! and matrix color filters have no serialization path at all.
//!
//! During SVG export the painter therefore draws a tiny **sentinel** image
//! in place of any image whose original encoded bytes are available, records
//! what was drawn in order, and the exporter substitutes the original bytes
//! (plus real dimensions and fidelity attributes) into the emitted SVG
//! afterwards — see `export::svg_image_substitution`.
//!
//! Draws that cannot be substituted (filters baked into pixels, images with
//! no encoded source bytes) are recorded as [`ExportImageDraw::Passthrough`]
//! so the substitution pass can keep its strict 1:1 draw↔element accounting.

use std::cell::RefCell;

use crate::cg::types::BlendMode;

/// Sentinel dimensions (px). Kept tiny so the device's mandatory
/// decode+PNG-encode of the drawn image is effectively free.
pub const SENTINEL_SIZE: i32 = 2;

/// One recorded direct image draw, in draw order.
#[derive(Debug, Clone)]
pub enum ExportImageDraw {
    /// A sentinel was drawn; the emitted `<image>` element must be rewritten
    /// to the real dimensions and the original encoded bytes.
    Substitute {
        /// Natural dimensions of the real image (the fit matrix was computed
        /// against these).
        width: u32,
        height: u32,
        /// The repository image's original encoded bytes, verbatim.
        bytes: Vec<u8>,
        /// Sniffed mime of `bytes` (e.g. `image/jpeg`).
        mime: &'static str,
        /// Blend mode to re-emit as CSS `mix-blend-mode` (dropped by the
        /// device).
        blend_mode: BlendMode,
        /// The canvas CTM at draw time, in SVG `matrix(a b c d e f)` order.
        /// The sentinel is drawn via `drawImageRect` scaled up to the real
        /// image bounds (so canvas quick-reject sees the true geometry),
        /// which makes the device serialize `CTM · scale(W/s, H/s)` on the
        /// `<use>` — the substitution pass writes THIS matrix instead,
        /// exactly what a real natural-size draw would have serialized.
        transform: [f32; 6],
    },
    /// The real (or filter-baked) image was drawn; the emitted element keeps
    /// its device-encoded href, only fidelity attributes are fixed up.
    Passthrough {
        /// Dimensions of the image that was actually drawn.
        width: u32,
        height: u32,
        blend_mode: BlendMode,
    },
}

/// Per-export context: the sentinel image and the ordered draw log.
///
/// Created by the SVG exporter, threaded to the painter via the renderer.
/// Only ever used single-threaded within one export call.
#[derive(Debug)]
pub struct ExportImageContext {
    /// Ordered log of direct image draws.
    pub log: RefCell<Vec<ExportImageDraw>>,
    /// Tiny opaque stand-in drawn instead of substitutable images. Magenta,
    /// so an accidental substitution failure is visible instead of silent.
    sentinel: skia_safe::Image,
}

impl ExportImageContext {
    /// Returns `None` when the sentinel surface cannot be created — the
    /// exporter then falls back to real draws (no substitution).
    pub fn new() -> Option<Self> {
        let mut surface = skia_safe::surfaces::raster_n32_premul((SENTINEL_SIZE, SENTINEL_SIZE))?;
        surface.canvas().clear(skia_safe::Color::MAGENTA);
        Some(Self {
            log: RefCell::new(Vec::new()),
            sentinel: surface.image_snapshot(),
        })
    }

    pub fn sentinel(&self) -> &skia_safe::Image {
        &self.sentinel
    }

    pub fn record(&self, draw: ExportImageDraw) {
        self.log.borrow_mut().push(draw);
    }

    pub fn take_log(&self) -> Vec<ExportImageDraw> {
        std::mem::take(&mut *self.log.borrow_mut())
    }
}

/// Sniff the mime type of encoded image bytes. Only formats every consumer
/// of the exported SVG (browsers, usvg) can decode are recognized — anything
/// else returns `None` and the draw falls back to the device's PNG encode.
pub fn sniff_image_mime(bytes: &[u8]) -> Option<&'static str> {
    match bytes {
        [0xFF, 0xD8, 0xFF, ..] => Some("image/jpeg"),
        [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, ..] => Some("image/png"),
        [b'G', b'I', b'F', b'8', b'7' | b'9', b'a', ..] => Some("image/gif"),
        [b'R', b'I', b'F', b'F', _, _, _, _, b'W', b'E', b'B', b'P', ..] => Some("image/webp"),
        _ => None,
    }
}

/// CSS `mix-blend-mode` value for a paint blend mode; `None` for `Normal`
/// (the default — nothing to emit).
pub fn css_mix_blend_mode(mode: BlendMode) -> Option<&'static str> {
    match mode {
        BlendMode::Normal => None,
        BlendMode::Multiply => Some("multiply"),
        BlendMode::Screen => Some("screen"),
        BlendMode::Overlay => Some("overlay"),
        BlendMode::Darken => Some("darken"),
        BlendMode::Lighten => Some("lighten"),
        BlendMode::ColorDodge => Some("color-dodge"),
        BlendMode::ColorBurn => Some("color-burn"),
        BlendMode::HardLight => Some("hard-light"),
        BlendMode::SoftLight => Some("soft-light"),
        BlendMode::Difference => Some("difference"),
        BlendMode::Exclusion => Some("exclusion"),
        BlendMode::Hue => Some("hue"),
        BlendMode::Saturation => Some("saturation"),
        BlendMode::Color => Some("color"),
        BlendMode::Luminosity => Some("luminosity"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sniffs_common_formats() {
        assert_eq!(
            sniff_image_mime(&[0xFF, 0xD8, 0xFF, 0xE0]),
            Some("image/jpeg")
        );
        assert_eq!(
            sniff_image_mime(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]),
            Some("image/png")
        );
        assert_eq!(sniff_image_mime(b"GIF89a..."), Some("image/gif"));
        assert_eq!(
            sniff_image_mime(b"RIFF\x00\x00\x00\x00WEBPVP8 "),
            Some("image/webp")
        );
        assert_eq!(sniff_image_mime(b"BM..bitmap"), None);
        assert_eq!(sniff_image_mime(&[]), None);
    }
}
