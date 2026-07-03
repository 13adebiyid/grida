use crate::{
    export::{ExportAsSVG, Exported},
    node::schema::Scene,
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
    let width = rect.width;
    let height = rect.height;

    // Guard: Skia cannot create a raster surface with zero or negative dimensions.
    let pixel_w = width as i32;
    let pixel_h = height as i32;
    if pixel_w <= 0 || pixel_h <= 0 {
        return None;
    }

    // Create SVG canvas
    let bounds = SkRect::from_wh(width, height);
    let canvas = svg::Canvas::new(bounds, None);

    // Camera focusing on the node bounds
    let camera = Camera2D::new_from_bounds(rect);

    // Temporary renderer using raster backend sharing the ByteStore
    let store = fonts.store();
    let mut renderer = Renderer::new_with_store(
        Backend::new_from_raster(pixel_w, pixel_h),
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

    renderer.fonts = fonts.clone();
    renderer.images = images.clone();
    renderer.load_scene(scene.clone());

    renderer.render_to_canvas(&canvas, width, height);

    let data = canvas.end();

    renderer.free();

    Some(Exported::SVG(data.as_bytes().to_vec()))
}
