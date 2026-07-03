//! Post-render substitution of direct image fills in exported SVG.
//!
//! During SVG export the painter draws direct image fills as tiny sentinels
//! (or filter-baked snapshots) and records them in draw order — see
//! `painter::image_export`. Skia's `SkSVGDevice` serializes each direct
//! image draw as
//!
//! ```text
//! <defs><image id="img_N" width="W" height="H" xlink:href="data:image/png;base64,..."/></defs>
//! <use [fill-opacity=".."] transform="matrix(..)" xlink:href="#img_N"/>
//! ```
//!
//! (`Tile` fills stay on the shader path, whose `<image>` lives *inside* a
//! `<pattern>` element — those are never touched.)
//!
//! This pass walks the emitted document and, for every recorded draw:
//! - **Substitute**: rewrites the sentinel `<image>` element's `width`/
//!   `height` to the real natural dimensions and its href to a data URI of
//!   the repository's ORIGINAL encoded bytes (no PNG re-encode);
//! - **Passthrough**: leaves the device-encoded href in place;
//! - both kinds: renames `fill-opacity` on the referencing `<use>` to
//!   `opacity` (per SVG, `fill-opacity` has no effect on a referenced
//!   raster `<image>`), and emits the recorded blend mode as CSS
//!   `mix-blend-mode` (the device has no serialization path for either).
//!
//! **Strict accounting**: the number of non-pattern `<image>` elements must
//! equal the number of recorded draws, sentinels must look exactly like
//! sentinels, and passthrough dimensions must match. Any mismatch returns an
//! error and the exporter falls back to a real-draw render pass (today's
//! output: correct, just PNG-bloated). Substitution must never guess.

use crate::painter::image_export::{css_mix_blend_mode, ExportImageDraw, SENTINEL_SIZE};
use base64::Engine as _;
use std::ops::Range;

#[derive(Debug, PartialEq, Eq)]
pub enum SubstitutionError {
    /// Non-pattern `<image>` element count != recorded draw count.
    CountMismatch { expected: usize, found: usize },
    /// An `<image>` element could not be parsed (no id / no closing `>`).
    MalformedElement { index: usize },
    /// A recorded sentinel draw's element is not sentinel-shaped.
    SentinelShapeMismatch { index: usize },
    /// A passthrough draw's element dimensions don't match the record.
    DimsMismatch { index: usize },
    /// No `<use>` references the element's id.
    MissingUse { index: usize },
}

/// Apply the recorded draws to the emitted SVG. See module docs.
pub fn substitute_direct_image_fills(
    svg: &str,
    draws: &[ExportImageDraw],
) -> Result<String, SubstitutionError> {
    let pattern_spans = collect_pattern_spans(svg);
    let image_spans = collect_image_spans(svg, &pattern_spans)?;

    if image_spans.len() != draws.len() {
        return Err(SubstitutionError::CountMismatch {
            expected: draws.len(),
            found: image_spans.len(),
        });
    }

    // Collected edits: non-overlapping (range, replacement) pairs.
    let mut edits: Vec<(Range<usize>, String)> = Vec::new();

    for (index, (span, draw)) in image_spans.iter().zip(draws.iter()).enumerate() {
        let tag = &svg[span.clone()];
        let id = attr_value(tag, "id")
            .ok_or(SubstitutionError::MalformedElement { index })?
            .to_owned();
        let w: Option<u32> = attr_value(tag, "width").and_then(|v| v.parse().ok());
        let h: Option<u32> = attr_value(tag, "height").and_then(|v| v.parse().ok());

        let (blend_mode, transform_override) = match draw {
            ExportImageDraw::Substitute {
                width,
                height,
                bytes,
                mime,
                blend_mode,
                transform,
            } => {
                // The element must look exactly like the drawn sentinel.
                if w != Some(SENTINEL_SIZE as u32) || h != Some(SENTINEL_SIZE as u32) {
                    return Err(SubstitutionError::SentinelShapeMismatch { index });
                }
                let href =
                    attr_value(tag, "href").ok_or(SubstitutionError::MalformedElement { index })?;
                if !href.starts_with("data:image/png;base64,") || href.len() > 4096 {
                    return Err(SubstitutionError::SentinelShapeMismatch { index });
                }

                let w_span = attr_value_span(tag, "width")
                    .ok_or(SubstitutionError::MalformedElement { index })?;
                let h_span = attr_value_span(tag, "height")
                    .ok_or(SubstitutionError::MalformedElement { index })?;
                let href_span = attr_value_span(tag, "href")
                    .ok_or(SubstitutionError::MalformedElement { index })?;

                let payload = base64::engine::general_purpose::STANDARD.encode(bytes);
                edits.push((offset(span, w_span), width.to_string()));
                edits.push((offset(span, h_span), height.to_string()));
                edits.push((
                    offset(span, href_span),
                    format!("data:{mime};base64,{payload}"),
                ));
                (*blend_mode, Some(*transform))
            }
            ExportImageDraw::Passthrough {
                width,
                height,
                blend_mode,
            } => {
                if w != Some(*width) || h != Some(*height) {
                    return Err(SubstitutionError::DimsMismatch { index });
                }
                (*blend_mode, None)
            }
        };

        // Fidelity fix-ups on the referencing <use>.
        let use_span = find_use_span(svg, &id).ok_or(SubstitutionError::MissingUse { index })?;
        let use_tag = &svg[use_span.clone()];
        if let Some(name_span) = attr_name_span(use_tag, "fill-opacity") {
            edits.push((offset(&use_span, name_span), "opacity".to_owned()));
        }
        if let Some([a, b, c, d, e, f]) = transform_override {
            // The sentinel was drawn scaled up to the real image bounds, so
            // the device serialized CTM·scale(W/s, H/s). Write the recorded
            // CTM instead — exactly what a real natural-size draw emits.
            let matrix = format!("matrix({a} {b} {c} {d} {e} {f})");
            if let Some(t_span) = attr_value_span(use_tag, "transform") {
                edits.push((offset(&use_span, t_span), matrix));
            } else {
                let insert_at = if use_tag.ends_with("/>") {
                    use_span.end - 2
                } else {
                    use_span.end - 1
                };
                edits.push((insert_at..insert_at, format!(" transform=\"{matrix}\"")));
            }
        }
        if let Some(css) = css_mix_blend_mode(blend_mode) {
            let insert_at = if use_tag.ends_with("/>") {
                use_span.end - 2
            } else {
                use_span.end - 1
            };
            edits.push((
                insert_at..insert_at,
                format!(" style=\"mix-blend-mode:{css}\""),
            ));
        }
    }

    Ok(apply_edits(svg, edits))
}

fn offset(base: &Range<usize>, inner: Range<usize>) -> Range<usize> {
    (base.start + inner.start)..(base.start + inner.end)
}

/// `<pattern ...> ... </pattern>` spans. An unterminated pattern swallows the
/// rest of the document (conservative: its images are then invisible to the
/// pass, which surfaces as a count mismatch → fallback).
fn collect_pattern_spans(svg: &str) -> Vec<Range<usize>> {
    let mut spans = Vec::new();
    let mut from = 0;
    while let Some(rel) = svg[from..].find("<pattern") {
        let start = from + rel;
        let end = match svg[start..].find("</pattern>") {
            Some(rel_end) => start + rel_end + "</pattern>".len(),
            None => svg.len(),
        };
        spans.push(start..end);
        from = end;
    }
    spans
}

/// Spans of `<image ...>` elements outside every pattern span, in document
/// order.
fn collect_image_spans(
    svg: &str,
    pattern_spans: &[Range<usize>],
) -> Result<Vec<Range<usize>>, SubstitutionError> {
    let mut spans = Vec::new();
    let mut from = 0;
    while let Some(rel) = svg[from..].find("<image") {
        let start = from + rel;
        // Reject `<imageFoo`-style false prefixes.
        let next = svg.as_bytes().get(start + "<image".len());
        if !matches!(
            next,
            Some(b' ') | Some(b'\t') | Some(b'\n') | Some(b'/') | Some(b'>')
        ) {
            from = start + "<image".len();
            continue;
        }
        let Some(rel_end) = svg[start..].find('>') else {
            return Err(SubstitutionError::MalformedElement { index: spans.len() });
        };
        let end = start + rel_end + 1;
        if !pattern_spans.iter().any(|p| p.contains(&start)) {
            spans.push(start..end);
        }
        from = end;
    }
    Ok(spans)
}

/// The `<use ...>` tag whose (xlink:)href is exactly `#id`.
fn find_use_span(svg: &str, id: &str) -> Option<Range<usize>> {
    let needle_xlink = format!("xlink:href=\"#{id}\"");
    let needle_plain = format!("href=\"#{id}\"");
    let mut from = 0;
    while let Some(rel) = svg[from..].find("<use") {
        let start = from + rel;
        let rel_end = svg[start..].find('>')?;
        let end = start + rel_end + 1;
        let tag = &svg[start..end];
        if tag.contains(&needle_xlink) || tag.contains(&needle_plain) {
            return Some(start..end);
        }
        from = end;
    }
    None
}

/// Value of `name="..."` (or `xlink:name="..."`) within a tag.
fn attr_value<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let span = attr_value_span(tag, name)?;
    Some(&tag[span])
}

/// Span of the VALUE of `name="..."` within `tag` (relative to tag start).
fn attr_value_span(tag: &str, name: &str) -> Option<Range<usize>> {
    let name_span = attr_name_span(tag, name)?;
    let after = &tag[name_span.end..];
    let rest = after.strip_prefix("=\"")?;
    let vlen = rest.find('"')?;
    let vstart = name_span.end + 2;
    Some(vstart..vstart + vlen)
}

/// Span of the attribute NAME within `tag`, matching ` name="` or
/// ` xlink:name="` (relative to tag start; the span covers only `name` /
/// `xlink:name`).
fn attr_name_span(tag: &str, name: &str) -> Option<Range<usize>> {
    for candidate in [name.to_owned(), format!("xlink:{name}")] {
        let pattern = format!(" {candidate}=\"");
        if let Some(pos) = tag.find(&pattern) {
            let start = pos + 1;
            return Some(start..start + candidate.len());
        }
    }
    None
}

/// Apply non-overlapping edits (sorted by start) to `svg`.
fn apply_edits(svg: &str, mut edits: Vec<(Range<usize>, String)>) -> String {
    edits.sort_by_key(|(r, _)| r.start);
    let mut out = String::with_capacity(svg.len());
    let mut cursor = 0;
    for (range, replacement) in edits {
        debug_assert!(range.start >= cursor, "edits must not overlap");
        out.push_str(&svg[cursor..range.start]);
        out.push_str(&replacement);
        cursor = range.end;
    }
    out.push_str(&svg[cursor..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cg::types::BlendMode;

    const SENTINEL_HREF: &str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg";

    fn sentinel_element(id: &str) -> String {
        format!(
            r#"<defs><image id="{id}" width="2" height="2" xlink:href="{SENTINEL_HREF}"/></defs>"#
        )
    }

    fn use_element(id: &str, extra: &str) -> String {
        format!(r##"<use{extra} transform="matrix(5 0 0 5 0 -50)" xlink:href="#{id}"/>"##)
    }

    fn substitute_draw(bytes: &[u8]) -> ExportImageDraw {
        ExportImageDraw::Substitute {
            width: 40,
            height: 40,
            bytes: bytes.to_vec(),
            mime: "image/jpeg",
            blend_mode: BlendMode::Normal,
            transform: [5.0, 0.0, 0.0, 5.0, 0.0, -50.0],
        }
    }

    #[test]
    fn substitutes_sentinel_with_original_bytes_and_dims() {
        let svg = format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg">{}{}</svg>"#,
            sentinel_element("img_0"),
            use_element("img_0", "")
        );
        let bytes = vec![0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3];
        let out = substitute_direct_image_fills(&svg, &[substitute_draw(&bytes)]).unwrap();
        let payload = base64::engine::general_purpose::STANDARD.encode(&bytes);
        assert!(out.contains(&format!(
            r#"width="40" height="40" xlink:href="data:image/jpeg;base64,{payload}""#
        )));
        assert!(!out.contains(SENTINEL_HREF));
        // Untouched transform.
        assert!(out.contains(r#"transform="matrix(5 0 0 5 0 -50)""#));
    }

    #[test]
    fn renames_fill_opacity_to_opacity_on_the_use() {
        let svg = format!(
            r#"<svg>{}{}</svg>"#,
            sentinel_element("img_0"),
            use_element("img_0", r#" fill-opacity="0.6""#)
        );
        let out =
            substitute_direct_image_fills(&svg, &[substitute_draw(&[0xFF, 0xD8, 0xFF])]).unwrap();
        assert!(out.contains(r#"<use opacity="0.6""#));
        assert!(!out.contains("fill-opacity"));
    }

    #[test]
    fn emits_css_mix_blend_mode() {
        let svg = format!(
            r#"<svg>{}{}</svg>"#,
            sentinel_element("img_0"),
            use_element("img_0", "")
        );
        let draw = ExportImageDraw::Substitute {
            width: 40,
            height: 40,
            bytes: vec![0xFF, 0xD8, 0xFF],
            mime: "image/jpeg",
            blend_mode: BlendMode::Multiply,
            transform: [5.0, 0.0, 0.0, 5.0, 0.0, -50.0],
        };
        let out = substitute_direct_image_fills(&svg, &[draw]).unwrap();
        assert!(out.contains(r#" style="mix-blend-mode:multiply"/>"#));
    }

    /// The device serializes the sentinel-upscaled matrix (CTM·scale(W/s,
    /// H/s)); the pass must write the recorded CTM instead.
    #[test]
    fn rewrites_use_transform_to_the_recorded_ctm() {
        // Emitted transform carries the 40/2=20x sentinel upscale.
        let svg = format!(
            r##"<svg>{}<use transform="matrix(100 0 0 100 0 -50)" xlink:href="#img_0"/></svg>"##,
            sentinel_element("img_0"),
        );
        let out =
            substitute_direct_image_fills(&svg, &[substitute_draw(&[0xFF, 0xD8, 0xFF])]).unwrap();
        assert!(
            out.contains(r#"transform="matrix(5 0 0 5 0 -50)""#),
            "recorded CTM must replace the sentinel-upscaled matrix:\n{out}"
        );
        assert!(!out.contains("matrix(100"));
    }

    #[test]
    fn pattern_images_are_invisible_to_the_pass() {
        let svg = format!(
            r#"<svg><defs><pattern id="pattern_0"><image id="img_0" width="16" height="16" xlink:href="data:image/png;base64,AAAA"/></pattern></defs><rect fill="url(#pattern_0)"/>{}{}</svg>"#,
            sentinel_element("img_1"),
            use_element("img_1", "")
        );
        let bytes = vec![0xFF, 0xD8, 0xFF, 9, 9];
        let out = substitute_direct_image_fills(&svg, &[substitute_draw(&bytes)]).unwrap();
        // Pattern inner image untouched.
        assert!(out.contains(
            r#"<image id="img_0" width="16" height="16" xlink:href="data:image/png;base64,AAAA"/>"#
        ));
        // Direct image substituted.
        assert!(out.contains("data:image/jpeg;base64,"));
    }

    #[test]
    fn count_mismatch_errors() {
        let svg = format!(
            r#"<svg>{}{}</svg>"#,
            sentinel_element("img_0"),
            use_element("img_0", "")
        );
        let err = substitute_direct_image_fills(&svg, &[]).unwrap_err();
        assert_eq!(
            err,
            SubstitutionError::CountMismatch {
                expected: 0,
                found: 1
            }
        );
    }

    #[test]
    fn non_sentinel_element_for_substitute_draw_errors() {
        // Element dims are NOT the sentinel's — refuse to guess.
        let svg = format!(
            r#"<svg><defs><image id="img_0" width="40" height="40" xlink:href="{SENTINEL_HREF}"/></defs>{}</svg>"#,
            use_element("img_0", "")
        );
        let err = substitute_direct_image_fills(&svg, &[substitute_draw(&[0xFF, 0xD8, 0xFF])])
            .unwrap_err();
        assert_eq!(err, SubstitutionError::SentinelShapeMismatch { index: 0 });
    }

    #[test]
    fn passthrough_dims_mismatch_errors() {
        let svg = format!(
            r#"<svg><defs><image id="img_0" width="40" height="40" xlink:href="data:image/png;base64,AAAA"/></defs>{}</svg>"#,
            use_element("img_0", "")
        );
        let draw = ExportImageDraw::Passthrough {
            width: 41,
            height: 40,
            blend_mode: BlendMode::Normal,
        };
        let err = substitute_direct_image_fills(&svg, &[draw]).unwrap_err();
        assert_eq!(err, SubstitutionError::DimsMismatch { index: 0 });
    }

    #[test]
    fn missing_use_errors() {
        let svg = format!(r#"<svg>{}</svg>"#, sentinel_element("img_0"));
        let err = substitute_direct_image_fills(&svg, &[substitute_draw(&[0xFF, 0xD8, 0xFF])])
            .unwrap_err();
        assert_eq!(err, SubstitutionError::MissingUse { index: 0 });
    }

    #[test]
    fn multiple_draws_map_in_document_order() {
        let svg = format!(
            r#"<svg>{}{}{}{}</svg>"#,
            sentinel_element("img_0"),
            use_element("img_0", ""),
            sentinel_element("img_1"),
            use_element("img_1", "")
        );
        let a = vec![0xFF, 0xD8, 0xFF, 1];
        let b = vec![0xFF, 0xD8, 0xFF, 2];
        let out = substitute_direct_image_fills(&svg, &[substitute_draw(&a), substitute_draw(&b)])
            .unwrap();
        let pa = base64::engine::general_purpose::STANDARD.encode(&a);
        let pb = base64::engine::general_purpose::STANDARD.encode(&b);
        let ia = out.find(&pa).expect("first draw payload present");
        let ib = out.find(&pb).expect("second draw payload present");
        assert!(ia < ib, "draw order must map to document order");
    }
}
