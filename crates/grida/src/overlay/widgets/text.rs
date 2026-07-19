use crate::cache::scene::SceneCache;
use crate::painter::layer::PainterPictureTextLayer;
use crate::runtime::font_repository::FontRepository;
use skia_safe::{Path, PathBuilder};

pub struct TextOverlay;

impl TextOverlay {
    /// Creates a path with just the baselines for a text layer
    /// This is much more efficient than rendering the entire text outline
    /// Returns None if the text layer is not found in cache
    pub fn text_layer_baseline(
        cache: &SceneCache,
        layer: &PainterPictureTextLayer,
        fonts: &FontRepository,
    ) -> Option<Path> {
        // Get baseline information from the paragraph cache using the layer's ID
        if let Some((baseline_info, layout_height)) = cache
            .paragraph
            .borrow()
            .get_baseline_info_if_cached_by_id(&layer.id, layer.width, fonts.generation())
        {
            // Calculate vertical offset based on alignment and container height
            let y_offset = crate::text::vertical_align_offset(
                layer.height,
                layout_height,
                layer.text_align_vertical,
            );

            // Create a path with just the baselines
            let mut builder = PathBuilder::new();
            for baseline in baseline_info {
                // Add a line segment for the baseline with vertical offset
                let y = baseline.baseline_y + y_offset;
                builder.move_to((baseline.left, y));
                builder.line_to((baseline.left + baseline.width, y));
            }
            Some(builder.detach())
        } else {
            // Return None if text layer is not in cache
            None
        }
    }
}
