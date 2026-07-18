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
}
