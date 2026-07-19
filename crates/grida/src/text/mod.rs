pub mod attributed_paragraph;
pub mod paragraph_cache_layout;
pub mod text_style;
pub mod text_transform;

use crate::cg::types::{TextAlign, TextAlignVertical};
use crate::vectornetwork::VectorNetwork;
use skia_safe::textlayout;
use skia_safe::{textlayout::Paragraph, Matrix, Path, PathBuilder, Point};

/// Create a [`ParagraphStyle`] with standard settings.
///
/// Shared by measurement (`ParagraphCache`), rendering (`attributed_paragraph`),
/// and the text editing layout adapter. Centralises text-direction, alignment,
/// rounding-hack suppression, and max-lines/ellipsis.
pub fn make_paragraph_style(
    align: TextAlign,
    max_lines: Option<usize>,
    ellipsis: Option<&str>,
) -> textlayout::ParagraphStyle {
    let mut ps = textlayout::ParagraphStyle::new();
    ps.set_text_direction(textlayout::TextDirection::LTR);
    ps.set_text_align(align.into());
    ps.set_apply_rounding_hack(false);
    if let Some(max_lines) = max_lines.filter(|&m| m > 0) {
        ps.set_max_lines(max_lines);
        ps.set_ellipsis(ellipsis.unwrap_or("..."));
    }
    ps
}

/// Return the vertical paint offset for a paragraph inside its authored text
/// frame. A missing height is an auto-sized frame, so there is no alignment
/// space and the paragraph starts at zero. Fixed frames intentionally permit a
/// negative offset when the paragraph is taller than the frame; clipping then
/// follows the authored top/center/bottom alignment instead of silently
/// changing the font size.
#[inline]
pub fn vertical_align_offset(
    container_height: Option<f32>,
    layout_height: f32,
    alignment: TextAlignVertical,
) -> f32 {
    let Some(height) = container_height else {
        return 0.0;
    };
    match alignment {
        TextAlignVertical::Top => 0.0,
        TextAlignVertical::Center => (height - layout_height) / 2.0,
        TextAlignVertical::Bottom => height - layout_height,
    }
}

/// Convert a Skia [`Paragraph`] into a [`Path`].
pub fn paragraph_to_path(paragraph: &mut Paragraph) -> Path {
    let mut builder = PathBuilder::new();
    paragraph.visit(|_, run| {
        if let Some(run) = run {
            let font = run.font();
            let glyphs = run.glyphs();
            let positions = run.positions();
            let origin = run.origin();
            for (glyph, pos) in glyphs.iter().zip(positions.iter()) {
                if let Some(glyph_path) = font.get_path(*glyph) {
                    let offset = Point::new(pos.x + origin.x, pos.y + origin.y);
                    if offset.x != 0.0 || offset.y != 0.0 {
                        let transformed =
                            glyph_path.make_transform(&Matrix::translate((offset.x, offset.y)));
                        builder.add_path(&transformed);
                    } else {
                        builder.add_path(&glyph_path);
                    }
                }
            }
        }
    });
    builder.detach()
}

/// Convert a Skia [`Paragraph`] into a [`VectorNetwork`].
pub fn paragraph_to_vector_network(paragraph: &mut Paragraph) -> VectorNetwork {
    let path = paragraph_to_path(paragraph);
    VectorNetwork::from(&path)
}

#[cfg(test)]
mod tests {
    use super::vertical_align_offset;
    use crate::cg::types::TextAlignVertical;

    #[test]
    fn vertical_alignment_uses_the_authored_fixed_frame() {
        assert_eq!(
            vertical_align_offset(Some(300.0), 100.0, TextAlignVertical::Top),
            0.0
        );
        assert_eq!(
            vertical_align_offset(Some(300.0), 100.0, TextAlignVertical::Center),
            100.0
        );
        assert_eq!(
            vertical_align_offset(Some(300.0), 100.0, TextAlignVertical::Bottom),
            200.0
        );
    }

    #[test]
    fn auto_height_has_no_artificial_alignment_space() {
        assert_eq!(
            vertical_align_offset(None, 100.0, TextAlignVertical::Center),
            0.0
        );
    }

    #[test]
    fn overflowing_fixed_text_keeps_its_authored_alignment() {
        assert_eq!(
            vertical_align_offset(Some(100.0), 180.0, TextAlignVertical::Center),
            -40.0
        );
        assert_eq!(
            vertical_align_offset(Some(100.0), 180.0, TextAlignVertical::Bottom),
            -80.0
        );
    }
}
