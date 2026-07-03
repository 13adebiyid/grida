//! Fit-aware SVG export: image fills must carry their box-fit geometry
//! into the exported SVG.
//!
//! Skia's `SkSVGDevice` serializes image *shaders* as a device-sized
//! `<pattern>` holding the image at natural size — the shader's local
//! matrix (which is where the painter encodes the box-fit) is dropped,
//! so `Fit(Cover)`/`Fit(Contain)`/`Transform` image fills exported at
//! native size ("the cropped backdrop" bug). Direct image draws keep
//! full geometry via a `transform` attribute, so the SVG export path
//! draws image fills directly instead of through shaders.

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

const RID: &str = "res://images/fit-test";

/// Encode a `w x h` solid PNG via Skia so the test controls the image's
/// natural dimensions exactly (no fixture dependency).
fn png_bytes(w: i32, h: i32) -> Vec<u8> {
    let mut surface = skia_safe::surfaces::raster_n32_premul((w, h)).unwrap();
    surface.canvas().clear(skia_safe::Color::RED);
    let img = surface.image_snapshot();
    img.encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap()
        .as_bytes()
        .to_vec()
}

/// Build a scene with a single rectangle at the origin whose only fill is
/// the given image paint, plus the repositories needed for export.
fn scene_with_image_fill(
    container: (f32, f32),
    image_natural: (i32, i32),
    fit: ImagePaintFit,
) -> (Scene, NodeId, FontRepository, ImageRepository) {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(0.0, 0.0, 0.0);
    rect.size = Size {
        width: container.0,
        height: container.1,
    };
    rect.fills = Paints::new([Paint::Image(ImagePaint {
        active: true,
        image: ResourceRef::RID(RID.to_string()),
        quarter_turns: 0,
        alignement: Alignment::CENTER,
        fit,
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
        filters: ImageFilters::default(),
    })]);

    let rect_id = graph.append_child(Node::Rectangle(rect), Parent::Root);

    let scene = Scene {
        name: "SVG Fit Export".into(),
        background_color: None,
        graph,
    };

    let store = Arc::new(Mutex::new(ByteStore::new()));
    let fonts = FontRepository::new(store.clone());
    let mut images = ImageRepository::new(store);
    let dims = images.insert_bytes(
        RID.to_string(),
        &png_bytes(image_natural.0, image_natural.1),
    );
    assert_eq!(
        dims,
        Some((image_natural.0 as u32, image_natural.1 as u32)),
        "test image must register with its natural dimensions"
    );

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

/// Extract every `matrix(a b c d e f)` transform in the SVG as 6 floats.
/// Tolerates both space- and comma-separated numbers.
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

fn approx(a: f32, b: f32) -> bool {
    (a - b).abs() < 1e-3
}

fn has_matrix(svg: &str, expected: [f32; 6]) -> bool {
    matrices(svg)
        .iter()
        .any(|m| m.iter().zip(expected.iter()).all(|(a, e)| approx(*a, *e)))
}

/// Cover fit, image smaller + squarer than the container: the fit scales the
/// image up to cover and crops vertically. 40x40 image in a 200x100 container:
/// scale = max(200/40, 100/40) = 5, scaled size 200x200, centered -> ty = -50.
#[test]
fn svg_export_carries_cover_fit_geometry() {
    let (scene, node_id, fonts, images) =
        scene_with_image_fill((200.0, 100.0), (40, 40), ImagePaintFit::Fit(BoxFit::Cover));
    let svg = export_svg(&scene, &node_id, &fonts, &images);

    assert!(
        svg.contains("data:image/"),
        "exported SVG should embed the image, got:\n{svg}"
    );
    assert!(
        has_matrix(&svg, [5.0, 0.0, 0.0, 5.0, 0.0, -50.0]),
        "exported SVG must place the image with the cover-fit transform \
         matrix(5 0 0 5 0 -50); transforms found: {:?}\nSVG:\n{svg}",
        matrices(&svg)
    );
    assert!(
        !svg.contains("<pattern"),
        "a Fit image fill must not fall back to the lossy native-size \
         <pattern> serialization:\n{svg}"
    );
}

/// Contain fit, same shapes: image scales to 100x100 and centers -> tx = 50.
#[test]
fn svg_export_carries_contain_fit_geometry() {
    let (scene, node_id, fonts, images) = scene_with_image_fill(
        (200.0, 100.0),
        (40, 40),
        ImagePaintFit::Fit(BoxFit::Contain),
    );
    let svg = export_svg(&scene, &node_id, &fonts, &images);

    assert!(
        has_matrix(&svg, [2.5, 0.0, 0.0, 2.5, 50.0, 0.0]),
        "exported SVG must place the image with the contain-fit transform \
         matrix(2.5 0 0 2.5 50 0); transforms found: {:?}\nSVG:\n{svg}",
        matrices(&svg)
    );
    assert!(!svg.contains("<pattern"), "no lossy pattern for Fit fills");
}
