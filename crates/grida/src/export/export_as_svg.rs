use crate::{
    export::{svg_image_substitution::substitute_direct_image_fills, ExportAsSVG, Exported},
    node::schema::Scene,
    painter::image_export::{ExportImageContext, ExportImageDraw},
    runtime::{
        camera::Camera2D,
        font_repository::FontRepository,
        image_repository::ImageRepository,
        render_policy::RenderPolicy,
        scene::{Backend, Renderer, RendererOptions},
    },
};
use math2::Rectangle;
use skia_safe::{svg, Rect as SkRect};

pub fn export_node_as_svg(
    scene: &Scene,
    fonts: &FontRepository,
    images: &ImageRepository,
    rect: Rectangle,
    _options: ExportAsSVG,
) -> Option<Exported> {
    // Guard: Skia cannot create a raster surface with zero or negative dimensions.
    let pixel_w = rect.width as i32;
    let pixel_h = rect.height as i32;
    if pixel_w <= 0 || pixel_h <= 0 {
        return None;
    }

    // First pass: draw substitutable image fills as tiny sentinels and
    // splice the repository's ORIGINAL encoded bytes into the emitted
    // document afterwards — Skia's SVG device would otherwise decode and
    // re-encode every photo as full-resolution PNG (~6-8x payload, plus a
    // multi-second stall). See `painter::image_export` and
    // `export::svg_image_substitution`.
    if let Some(ctx) = ExportImageContext::new() {
        let (bytes, log) = render_svg_pass(scene, fonts, images, rect, Some(ctx))?;
        if log.is_empty() {
            return Some(Exported::SVG(bytes));
        }
        if let Ok(svg_str) = String::from_utf8(bytes) {
            if let Ok(substituted) = substitute_direct_image_fills(&svg_str, &log) {
                return Some(Exported::SVG(substituted.into_bytes()));
            }
        }
        // Verification failed — fall through to a real-draw pass. That
        // output is correct (device-encoded PNGs), only payload-bloated;
        // sentinels must never ship.
    }

    let (bytes, _) = render_svg_pass(scene, fonts, images, rect, None)?;
    Some(Exported::SVG(bytes))
}

/// One full SVG render pass. With `ctx`, direct image fills draw as
/// substitutable sentinels (or filter-baked snapshots) and the returned log
/// carries them in draw order; without, they draw for real.
fn render_svg_pass(
    scene: &Scene,
    fonts: &FontRepository,
    images: &ImageRepository,
    rect: Rectangle,
    ctx: Option<ExportImageContext>,
) -> Option<(Vec<u8>, Vec<ExportImageDraw>)> {
    let width = rect.width;
    let height = rect.height;

    // Create SVG canvas
    let bounds = SkRect::from_wh(width, height);
    let canvas = svg::Canvas::new(bounds, None);

    // Camera focusing on the node bounds
    let camera = Camera2D::new_from_bounds(rect);

    // Temporary renderer using raster backend sharing the ByteStore
    let store = fonts.store();
    let mut renderer = Renderer::new_with_store(
        Backend::new_from_raster(width as i32, height as i32),
        None,
        camera,
        store,
        RendererOptions::default(),
    );

    // SVG output must carry image box-fit geometry as explicit transforms:
    // Skia's SVG device serializes image SHADERS as device-sized patterns
    // holding the image at natural size, dropping the fit entirely. Direct
    // image draws serialize with full geometry instead.
    renderer.set_render_policy(RenderPolicy {
        direct_image_fills: true,
        ..RenderPolicy::STANDARD
    });
    renderer.set_image_export_context(ctx);

    renderer.fonts = fonts.clone();
    renderer.images = images.clone();
    renderer.load_scene(scene.clone());

    renderer.render_to_canvas(&canvas, width, height);

    let data = canvas.end();
    let log = renderer
        .image_export_context()
        .map(|c| c.take_log())
        .unwrap_or_default();

    renderer.free();

    Some((data.as_bytes().to_vec(), log))
}
