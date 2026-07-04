//! Repro hunt for the 2026-07-04 editor freeze: repeated effect toggles +
//! raster PNG exports wedge the renderer permanently (observed twice in the
//! deployed wasm bundle; the operator hit it live while testing shape
//! effects). This drives the SAME warm-cache export path the runtime uses
//! (`Renderer::export_node_image`) through apply→export→clear cycles for
//! every effect kind, on a stage-contained shape and a text node.
//!
//! Run with an external timeout — a hang IS the finding:
//! `timeout 120 cargo test -p grida --test export_effects_hang`

use grida::cg::prelude::*;
use grida::node::{
    factory::NodeFactory,
    scene_graph::{Parent, SceneGraph},
    schema::*,
};
use grida::runtime::{
    camera::Camera2D,
    scene::{Backend, Renderer},
};
use math2::transform::AffineTransform;

fn build_scene(effect: Option<FilterEffect>, on_text: bool) -> (Scene, NodeId) {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut container = nf.create_container_node();
    container.clip = true;
    container.layout_dimensions.layout_target_width = Some(1920.0);
    container.layout_dimensions.layout_target_height = Some(1080.0);
    let container_id = graph.append_child(Node::Container(container), Parent::Root);

    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(300.0, 150.0, 0.0);
    rect.size = Size {
        width: 500.0,
        height: 200.0,
    };
    rect.set_fill(Paint::Solid(SolidPaint {
        color: CGColor::from_rgba(217, 77, 51, 255),
        blend_mode: BlendMode::Normal,
        active: true,
    }));
    if !on_text {
        if let Some(fx) = effect.clone() {
            rect.effects = LayerEffects::from_array(vec![fx]);
        }
    }
    graph.append_child(Node::Rectangle(rect), Parent::NodeId(container_id));

    let mut text = nf.create_text_span_node();
    text.transform = AffineTransform::new(200.0, 400.0, 0.0);
    text.text = "For God so loved the world".to_string();
    if on_text {
        if let Some(fx) = effect {
            text.effects = LayerEffects::from_array(vec![fx]);
        }
    }
    graph.append_child(Node::TextSpan(text), Parent::NodeId(container_id));

    let scene = Scene {
        name: "fx hang repro".into(),
        background_color: None,
        graph,
    };
    (scene, container_id)
}

fn export_cycle(effect: Option<FilterEffect>, on_text: bool) {
    let (scene, container_id) = build_scene(effect, on_text);

    let mut camera = Camera2D::new_from_bounds(math2::Rectangle {
        x: 0.0,
        y: 0.0,
        width: 1920.0,
        height: 1080.0,
    });
    camera.set_size(Size {
        width: 1920.0,
        height: 1080.0,
    });
    let mut renderer = Renderer::new(Backend::new_from_raster(1920, 1080), None, camera);
    renderer.load_scene(scene);

    let rect_bounds = renderer
        .get_cache()
        .geometry
        .get_render_bounds(&container_id)
        .expect("container bounds");
    let image = renderer
        .export_node_image(&container_id, rect_bounds, (320.0, 180.0))
        .expect("export must produce an image");
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("png encode");
    assert!(data.len() > 100);
    renderer.free();
}

fn effects_matrix() -> Vec<(&'static str, FilterEffect)> {
    vec![
        (
            "drop-shadow",
            FilterEffect::DropShadow(FeShadow {
                dx: 12.0,
                dy: 12.0,
                blur: 8.0,
                spread: 0.0,
                color: CGColor::from_rgba(0, 0, 0, 153),
                active: true,
            }),
        ),
        (
            "inner-shadow",
            FilterEffect::InnerShadow(FeShadow {
                dx: 8.0,
                dy: 8.0,
                blur: 8.0,
                spread: 0.0,
                color: CGColor::from_rgba(0, 0, 0, 153),
                active: true,
            }),
        ),
        (
            "layer-blur",
            FilterEffect::LayerBlur(FeLayerBlur {
                blur: FeBlur::Gaussian(FeGaussianBlur { radius: 8.0 }),
                active: true,
            }),
        ),
        (
            "backdrop-blur",
            FilterEffect::BackdropBlur(FeBackdropBlur {
                blur: FeBlur::Gaussian(FeGaussianBlur { radius: 8.0 }),
                active: true,
            }),
        ),
    ]
}

#[test]
fn export_shape_with_each_effect_terminates() {
    export_cycle(None, false);
    for (name, fx) in effects_matrix() {
        eprintln!("shape fx: {name}");
        export_cycle(Some(fx), false);
    }
}

#[test]
fn export_text_with_each_effect_terminates() {
    export_cycle(None, true);
    for (name, fx) in effects_matrix() {
        eprintln!("text fx: {name}");
        export_cycle(Some(fx), true);
    }
}
