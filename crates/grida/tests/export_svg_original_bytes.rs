//! SVG export must embed image fills from the repository's ORIGINAL encoded
//! bytes, not a full-resolution PNG re-encode.
//!
//! Skia's `SkSVGDevice::drawImageRect` unconditionally decodes the image and
//! re-encodes it as PNG (`drawBitmapCommon` → `EncodePng`) — for a
//! photographic JPEG that is a ~6-8x payload amplification plus a
//! multi-second decode+encode stall on every export. The exporter instead
//! draws a tiny sentinel with the real fit geometry and substitutes the
//! original encoded bytes (and real dimensions) into the emitted `<image>`
//! element afterwards.
//!
//! The same pass restores fidelity the device drops on image draws:
//! - paint alpha serializes as `fill-opacity`, which has no effect on a
//!   referenced raster `<image>` → rewritten to `opacity`;
//! - blend modes have no serialization path → emitted as CSS
//!   `mix-blend-mode`;
//! - matrix color filters (exposure/contrast/...) are silently dropped →
//!   baked into the drawn pixels (re-encode accepted for that case only).

use base64::Engine as _;
use grida::cg::prelude::*;
use grida::export::{export_node_as, ExportAs, Exported};
use grida::node::{
    factory::NodeFactory,
    scene_graph::{Parent, SceneGraph},
    schema::*,
};
use grida::resources::ByteStore;
use grida::runtime::{font_repository::FontRepository, image_repository::ImageRepository};
use math2::box_fit::BoxFit;
use math2::transform::AffineTransform;
use std::sync::{Arc, Mutex};

const RID: &str = "res://images/original-bytes-test";
const RID_TILE: &str = "res://images/original-bytes-tile";

fn encode_bytes(
    w: i32,
    h: i32,
    color: skia_safe::Color,
    format: skia_safe::EncodedImageFormat,
) -> Vec<u8> {
    let mut surface = skia_safe::surfaces::raster_n32_premul((w, h)).unwrap();
    surface.canvas().clear(color);
    let img = surface.image_snapshot();
    img.encode(None, format, Some(90))
        .expect("test image must encode")
        .as_bytes()
        .to_vec()
}

fn jpeg_bytes(w: i32, h: i32, color: skia_safe::Color) -> Vec<u8> {
    encode_bytes(w, h, color, skia_safe::EncodedImageFormat::JPEG)
}

fn png_bytes(w: i32, h: i32, color: skia_safe::Color) -> Vec<u8> {
    encode_bytes(w, h, color, skia_safe::EncodedImageFormat::PNG)
}

fn image_paint(fit: ImagePaintFit, rid: &str) -> ImagePaint {
    ImagePaint {
        active: true,
        image: ResourceRef::RID(rid.to_string()),
        quarter_turns: 0,
        alignement: Alignment::CENTER,
        fit,
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
        filters: ImageFilters::default(),
    }
}

/// Build a 200x100 rect scene with the given fills; register `images` as
/// (rid, bytes) pairs.
fn scene_with_fills(
    fills: Vec<Paint>,
    images_to_register: &[(&str, &[u8])],
) -> (Scene, NodeId, FontRepository, ImageRepository) {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(0.0, 0.0, 0.0);
    rect.size = Size {
        width: 200.0,
        height: 100.0,
    };
    rect.fills = Paints::new(fills);

    let rect_id = graph.append_child(Node::Rectangle(rect), Parent::Root);

    let scene = Scene {
        name: "SVG Original Bytes Export".into(),
        background_color: None,
        graph,
    };

    let store = Arc::new(Mutex::new(ByteStore::new()));
    let fonts = FontRepository::new(store.clone());
    let mut images = ImageRepository::new(store);
    for (rid, bytes) in images_to_register {
        images
            .insert_bytes(rid.to_string(), bytes)
            .expect("test image must register");
    }

    (scene, rect_id, fonts, images)
}

fn export_svg(
    scene: &Scene,
    node_id: &NodeId,
    fonts: &FontRepository,
    images: &ImageRepository,
) -> String {
    let geometry = grida::cache::geometry::GeometryCache::from_scene(scene, fonts);
    let exported = export_node_as(scene, &geometry, fonts, images, node_id, ExportAs::svg())
        .expect("SVG export should succeed");
    match exported {
        Exported::SVG(data) => String::from_utf8(data).expect("SVG must be valid UTF-8"),
        other => panic!(
            "expected SVG export, got {:?}",
            std::mem::discriminant(&other)
        ),
    }
}

/// Extract the base64 payload of every `data:image/<mime>;base64,` href.
fn data_uris(svg: &str) -> Vec<(String, Vec<u8>)> {
    let mut out = Vec::new();
    let mut rest = svg;
    while let Some(start) = rest.find("data:image/") {
        let after = &rest[start..];
        let Some(end) = after.find('"') else { break };
        let uri = &after[..end];
        if let Some((head, payload)) = uri.split_once(";base64,") {
            let mime = head.trim_start_matches("data:").to_string();
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(payload)
                .expect("data URI payload must be valid base64");
            out.push((mime, bytes));
        }
        rest = &after[end..];
    }
    out
}

/// The `<use>` tag that references the given def id.
fn use_tag_for<'a>(svg: &'a str, id_prefix: &str) -> Option<&'a str> {
    let mut rest = svg;
    while let Some(start) = rest.find("<use") {
        let after = &rest[start..];
        let end = after.find('>')?;
        let tag = &after[..=end];
        if tag.contains(&format!("\"#{id_prefix}")) {
            return Some(tag);
        }
        rest = &after[end..];
    }
    None
}

fn matrices(svg: &str) -> Vec<[f32; 6]> {
    let mut out = Vec::new();
    let mut rest = svg;
    while let Some(start) = rest.find("matrix(") {
        let after = &rest[start + "matrix(".len()..];
        let Some(end) = after.find(')') else { break };
        let nums: Vec<f32> = after[..end]
            .split(|c: char| c == ',' || c.is_whitespace())
            .filter(|s| !s.is_empty())
            .filter_map(|s| s.parse().ok())
            .collect();
        if nums.len() == 6 {
            out.push([nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]]);
        }
        rest = &after[end..];
    }
    out
}

fn has_matrix(svg: &str, expected: [f32; 6]) -> bool {
    matrices(svg).iter().any(|m| {
        m.iter()
            .zip(expected.iter())
            .all(|(a, e)| (a - e).abs() < 1e-3)
    })
}

/// The core contract: a JPEG image fill exports with the ORIGINAL encoded
/// bytes verbatim (no PNG re-encode), real dimensions on the `<image>`
/// element, and the cover-fit matrix intact.
#[test]
fn svg_export_embeds_original_jpeg_bytes_verbatim() {
    let jpeg = jpeg_bytes(40, 40, skia_safe::Color::RED);
    let (scene, node_id, fonts, images) = scene_with_fills(
        vec![Paint::Image(image_paint(
            ImagePaintFit::Fit(BoxFit::Cover),
            RID,
        ))],
        &[(RID, &jpeg)],
    );
    let svg = export_svg(&scene, &node_id, &fonts, &images);

    let uris = data_uris(&svg);
    assert_eq!(uris.len(), 1, "exactly one embedded image expected:\n{svg}");
    let (mime, bytes) = &uris[0];
    assert_eq!(mime, "image/jpeg", "href must carry the original JPEG mime");
    assert_eq!(
        bytes, &jpeg,
        "embedded bytes must be the original encoded bytes VERBATIM"
    );

    // Real dimensions on the <image> element (not the sentinel's).
    assert!(
        svg.contains(r#"width="40" height="40""#),
        "image element must carry the real natural dimensions:\n{svg}"
    );
    // Cover fit for a 40x40 image in 200x100: scale 5, ty -50.
    assert!(
        has_matrix(&svg, [5.0, 0.0, 0.0, 5.0, 0.0, -50.0]),
        "cover-fit matrix must survive; found {:?}\n{svg}",
        matrices(&svg)
    );
    assert!(
        !svg.contains("<pattern"),
        "no lossy pattern fallback:\n{svg}"
    );
}

/// PNG sources are substituted too (original PNG bytes, not a re-encode).
#[test]
fn svg_export_embeds_original_png_bytes_verbatim() {
    let png = png_bytes(40, 40, skia_safe::Color::BLUE);
    let (scene, node_id, fonts, images) = scene_with_fills(
        vec![Paint::Image(image_paint(
            ImagePaintFit::Fit(BoxFit::Contain),
            RID,
        ))],
        &[(RID, &png)],
    );
    let svg = export_svg(&scene, &node_id, &fonts, &images);

    let uris = data_uris(&svg);
    assert_eq!(uris.len(), 1);
    assert_eq!(uris[0].0, "image/png");
    assert_eq!(
        uris[0].1, png,
        "embedded bytes must be the original encoded bytes VERBATIM"
    );
}

/// Image paint opacity must survive as element `opacity` — the device
/// serializes paint alpha as `fill-opacity`, which has NO effect on a
/// referenced raster `<image>` per the SVG spec.
#[test]
fn svg_export_image_opacity_exports_as_element_opacity() {
    let jpeg = jpeg_bytes(40, 40, skia_safe::Color::RED);
    let mut paint = image_paint(ImagePaintFit::Fit(BoxFit::Cover), RID);
    paint.opacity = 0.6;
    let (scene, node_id, fonts, images) =
        scene_with_fills(vec![Paint::Image(paint)], &[(RID, &jpeg)]);
    let svg = export_svg(&scene, &node_id, &fonts, &images);

    let use_tag = use_tag_for(&svg, "img").expect("a <use> must reference the image def");
    assert!(
        !use_tag.contains("fill-opacity"),
        "fill-opacity is a no-op on raster <image> references:\n{use_tag}"
    );
    assert!(
        use_tag.contains(" opacity=\"0.6"),
        "the 0.6 image opacity must survive as element opacity:\n{use_tag}"
    );
}

/// Blend modes have no SkSVGDevice serialization path — emit the CSS
/// equivalent so the exported SVG matches the editor canvas.
#[test]
fn svg_export_image_blend_mode_maps_to_mix_blend_mode() {
    let jpeg = jpeg_bytes(40, 40, skia_safe::Color::RED);
    let mut paint = image_paint(ImagePaintFit::Fit(BoxFit::Cover), RID);
    paint.blend_mode = BlendMode::Multiply;
    let (scene, node_id, fonts, images) =
        scene_with_fills(vec![Paint::Image(paint)], &[(RID, &jpeg)]);
    let svg = export_svg(&scene, &node_id, &fonts, &images);

    let use_tag = use_tag_for(&svg, "img").expect("a <use> must reference the image def");
    assert!(
        use_tag.contains("mix-blend-mode:multiply"),
        "Multiply blend must export as CSS mix-blend-mode:\n{use_tag}"
    );
}

/// Image filters (exposure/contrast/...) are matrix color filters the device
/// silently drops. They must be BAKED into the drawn pixels — a re-encode is
/// accepted for the filtered case only.
#[test]
fn svg_export_filtered_image_bakes_color_filter() {
    let gray = skia_safe::Color::from_argb(255, 100, 100, 100);
    let jpeg = jpeg_bytes(40, 40, gray);
    let mut paint = image_paint(ImagePaintFit::Fit(BoxFit::Cover), RID);
    paint.filters = ImageFilters {
        exposure: 0.5,
        ..ImageFilters::default()
    };
    let (scene, node_id, fonts, images) =
        scene_with_fills(vec![Paint::Image(paint)], &[(RID, &jpeg)]);
    let svg = export_svg(&scene, &node_id, &fonts, &images);

    let uris = data_uris(&svg);
    assert_eq!(uris.len(), 1);
    let (mime, bytes) = &uris[0];
    assert_ne!(
        bytes, &jpeg,
        "filtered export must NOT ship the unfiltered original bytes"
    );
    assert_eq!(mime, "image/png", "baked filter output re-encodes as PNG");

    // The baked pixels must actually be brightened (exposure > 0).
    let data = skia_safe::Data::new_copy(bytes);
    let img = skia_safe::Image::from_encoded(data).expect("baked image must decode");
    let info = skia_safe::ImageInfo::new(
        (1, 1),
        skia_safe::ColorType::RGBA8888,
        skia_safe::AlphaType::Unpremul,
        None,
    );
    let mut pixel = [0u8; 4];
    assert!(img.read_pixels(
        &info,
        &mut pixel,
        4,
        (20, 20),
        skia_safe::image::CachingHint::Disallow
    ));
    assert!(
        pixel[0] > 120,
        "exposure must brighten the baked pixels (got r={})",
        pixel[0]
    );

    // Fit geometry still intact.
    assert!(
        has_matrix(&svg, [5.0, 0.0, 0.0, 5.0, 0.0, -50.0]),
        "cover-fit matrix must survive the baked-filter path; found {:?}",
        matrices(&svg)
    );
}

/// A cover-fit image fill inside a clipping container (the Rhema stage
/// shape) must export exactly ONE image draw — a duplicated draw would
/// double the payload and compound partial opacity.
#[test]
fn svg_export_draws_contained_image_fill_once() {
    let jpeg = jpeg_bytes(40, 40, skia_safe::Color::RED);
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut container = nf.create_container_node();
    container.clip = true;
    container.layout_dimensions.layout_target_width = Some(200.0);
    container.layout_dimensions.layout_target_height = Some(100.0);
    let container_id = graph.append_child(Node::Container(container), Parent::Root);

    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(0.0, 0.0, 0.0);
    rect.size = Size {
        width: 200.0,
        height: 100.0,
    };
    rect.fills = Paints::new([Paint::Image(image_paint(
        ImagePaintFit::Fit(BoxFit::Cover),
        RID,
    ))]);
    graph.append_child(Node::Rectangle(rect), Parent::NodeId(container_id));

    let scene = Scene {
        name: "SVG Contained Image Export".into(),
        background_color: None,
        graph,
    };
    let store = Arc::new(Mutex::new(ByteStore::new()));
    let fonts = FontRepository::new(store.clone());
    let mut images = ImageRepository::new(store);
    images
        .insert_bytes(RID.to_string(), &jpeg)
        .expect("test image must register");

    let svg = export_svg(&scene, &container_id, &fonts, &images);

    let uses = svg.matches("<use").count();
    let imgs = svg.matches("<image").count();
    assert_eq!(
        (imgs, uses),
        (1, 1),
        "a single contained image fill must export exactly one draw:\n{svg}"
    );
    assert_eq!(data_uris(&svg).len(), 1);
    assert_eq!(data_uris(&svg)[0].1, jpeg);
}

/// Tile fills stay on the faithful shader/pattern path; substitution must
/// not touch the pattern's inner <image> even when a Fit fill coexists in
/// the same fill stack.
#[test]
fn svg_export_tile_pattern_untouched_while_fit_substitutes() {
    let jpeg = jpeg_bytes(40, 40, skia_safe::Color::RED);
    let tile_png = png_bytes(16, 16, skia_safe::Color::GREEN);
    let tile_paint = image_paint(
        ImagePaintFit::Tile(ImageTile {
            scale: 1.0,
            repeat: ImageRepeat::default(),
        }),
        RID_TILE,
    );
    let fit_paint = image_paint(ImagePaintFit::Fit(BoxFit::Cover), RID);
    let (scene, node_id, fonts, images) = scene_with_fills(
        vec![Paint::Image(tile_paint), Paint::Image(fit_paint)],
        &[(RID, &jpeg), (RID_TILE, &tile_png)],
    );
    let svg = export_svg(&scene, &node_id, &fonts, &images);

    assert!(
        svg.contains("<pattern"),
        "Tile fills keep the pattern serialization:\n{svg}"
    );
    let uris = data_uris(&svg);
    let jpeg_matches: Vec<_> = uris.iter().filter(|(m, _)| m == "image/jpeg").collect();
    assert_eq!(
        jpeg_matches.len(),
        1,
        "exactly the Fit fill must substitute to the original JPEG"
    );
    assert_eq!(jpeg_matches[0].1, jpeg);
}
