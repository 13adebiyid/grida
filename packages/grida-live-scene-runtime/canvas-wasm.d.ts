declare module "@grida/canvas-wasm" {
  export interface GridaCanvasModuleInitOptions {
    locateFile(file: string, version: string): string;
  }

  export interface CanvasScene {
    loadSceneGrida(bytes: Uint8Array): void;
    switchScene(sceneId: string): void;
    loadedSceneIds(): string[];
    drainMissingImages(): string[];
    resolveImage(resourceId: string, bytes: Uint8Array): void;
    listMissingFonts(): Array<{ family: string }>;
    addFont(family: string, bytes: Uint8Array): void;
    setFallbackFonts(families: string[]): void;
    replaceNode(bytes: Uint8Array): boolean;
    getNodeAbsoluteBoundingBox(
      target: string
    ): { x: number; y: number; width: number; height: number } | null;
    setMainCameraTransform(
      transform: [[number, number, number], [number, number, number]]
    ): void;
    runtime_renderer_set_isolation_stage_preset(preset: number): void;
    resize(width: number, height: number): void;
    redraw(): void;
    dispose(): void;
  }

  interface ApplicationFactory {
    readonly module: {
      GL: {
        currentContext?: { handle: number } | null;
        makeContextCurrent(handle: number): void;
        deleteContext(handle: number): void;
      };
    };
    createWebGLCanvasSurface(
      canvas: HTMLCanvasElement,
      options?: {
        use_embedded_fonts?: boolean;
        config?: { skip_layout?: boolean };
      }
    ): CanvasScene;
  }

  export default function init(
    options?: Partial<GridaCanvasModuleInitOptions>
  ): Promise<ApplicationFactory>;

  export interface RasterCanvas {
    loadSceneGrida(bytes: Uint8Array): void;
    switchScene(sceneId: string): void;
    loadedSceneIds(): string[];
    addImageWithId(bytes: Uint8Array, resourceId: string): unknown;
    addFont(family: string, bytes: Uint8Array): void;
    setFallbackFonts(families: string[]): void;
    exportNodeAs(
      nodeId: string,
      options: {
        format: "PNG";
        constraints: { type: "scale-to-fit-width"; value: number };
      }
    ): { data: Uint8Array };
    dispose(): void;
  }

  export function createCanvas(options: {
    backend: "raster";
    width: number;
    height: number;
    locateFile?: (path: string, version: string) => string;
    useEmbeddedFonts?: boolean;
    config?: { skip_layout?: boolean };
  }): Promise<RasterCanvas>;
}
