/**
 * Background-video poster (2026-07-09) — the wasm canvas cannot decode
 * video, so a theme with a background video rendered a CLEAR stage in the
 * editor and operators couldn't judge text contrast. Bible Helper now ships
 * a poster frame (the media-bin thumbnail) over the pick-media reply (fresh
 * uploads) and a get-media-thumb request/reply (reopen), and this module
 * paints it as an image-filled rectangle at the BOTTOM of the stage.
 *
 * The poster is EDITOR CHROME, not design content:
 *   - inserted/refreshed programmatically (callers wrap in
 *     runProgrammaticEdit so it never arms the dirty flag / crash draft)
 *   - locked, so the operator can't select or move it
 *   - hidden around the save-time SVG export (hidePostersDuring) so it can
 *     NEVER bake into backdropSvg — on live output the real video plays
 *     there, and a baked frozen frame would double-render underneath it
 *     (theme-editor render pitfall #7: save/load schema agreement).
 *
 * It DOES ride the saved v2 document (OPFS + BH-stored snapshot) on
 * purpose: reopening the theme shows the poster immediately, and the boot
 * refresh only re-requests a thumb when the node is missing or the video
 * reference changed.
 */
import type { Editor } from "@/grida-canvas/editor";
import type grida from "@grida/schema";
import cg from "@grida/cg";
import cmath from "@grida/cmath";
import kolor from "@grida/color";

export const RHEMA_BG_VIDEO_POSTER_NAME = "rhema-bg-video-poster";
export const RHEMA_BACKGROUND_VIDEO_KEY = "rhema_background_video";

const GET_MEDIA_THUMB_REQUEST_TYPE = "bible-helper-get-media-thumb";
const GET_MEDIA_THUMB_RESULT_TYPE = "bible-helper-get-media-thumb-result";

type AnyNode = Record<string, unknown>;

function nodesOf(
  doc: grida.program.document.Document
): Record<string, AnyNode> {
  return doc.nodes as unknown as Record<string, AnyNode>;
}

/** All poster rectangles in the document (normally 0 or 1 per stage). */
export function findBgVideoPosterIds(
  doc: grida.program.document.Document
): string[] {
  const out: string[] = [];
  for (const [id, node] of Object.entries(nodesOf(doc))) {
    if (node && node.name === RHEMA_BG_VIDEO_POSTER_NAME) out.push(id);
  }
  return out;
}

/** Poster ids under one scene's subtree (bundle scenes each own a stage).
 *  Children live in the document's `links` table, not on the nodes. */
export function findBgVideoPosterIdsInScene(
  doc: grida.program.document.Document,
  sceneId: string
): string[] {
  const nodes = nodesOf(doc);
  const links =
    (doc as unknown as { links?: Record<string, string[]> }).links ?? {};
  const out: string[] = [];
  const stack = [...(links[sceneId] ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    const node = nodes[id];
    if (node?.name === RHEMA_BG_VIDEO_POSTER_NAME) out.push(id);
    const children = links[id];
    if (children?.length) stack.push(...children);
  }
  return out;
}

/** First stage-candidate container under a scene (mirrors the playground's
 *  isRhemaStageCandidate: named stage, or a >=1280x720 container). */
export function findStageIdInScene(
  doc: grida.program.document.Document,
  sceneId: string
): string | null {
  const nodes = nodesOf(doc);
  const links =
    (doc as unknown as { links?: Record<string, string[]> }).links ?? {};
  const children = links[sceneId] ?? [];
  for (const id of children) {
    if (typeof id !== "string") continue;
    const node = nodes[id];
    if (!node || node.type !== "container") continue;
    if (
      node.name === "Canvas 1920x1080" ||
      (typeof node.layout_target_width === "number" &&
        typeof node.layout_target_height === "number" &&
        node.layout_target_width >= 1280 &&
        node.layout_target_height >= 720)
    ) {
      return id;
    }
  }
  return null;
}

function dataUriToBytes(dataUri: string): Uint8Array | null {
  const base64 = dataUri.replace(/^data:[^;]+;base64,/, "");
  if (base64 === dataUri) return null; // not a base64 data URI
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Insert (or replace) the poster rectangle at the bottom of `stageId`.
 * Caller wraps in runProgrammaticEdit when the change must not arm the
 * dirty flag (boot refresh); the fresh-upload path runs it as part of the
 * operator's edit. The poster records its source blobKey in the node name
 * suffix-free way via userdata-less matching — staleness is detected by the
 * caller comparing scene userdata's blobKey against `posterSourceKey`.
 */
/** blobKey the scene's current poster was generated from (node userdata),
 *  so a REPLACED video invalidates its stale poster. */
export function readPosterSourceBlobKey(
  editor: Editor,
  sceneId: string
): string | null {
  const posterId = findBgVideoPosterIdsInScene(
    editor.state.document,
    sceneId
  )[0];
  if (!posterId) return null;
  const ud = (editor.getUserData(posterId) ?? {}) as Record<string, unknown>;
  const raw = ud.rhema_bg_video_poster_of;
  return typeof raw === "string" ? raw : null;
}

export async function applyBgVideoPoster(
  editor: Editor,
  sceneId: string,
  dataUri: string,
  sourceBlobKey: string,
  runEdit: (fn: () => void) => void = (fn) => fn()
): Promise<boolean> {
  const doc = editor.state.document;
  const stageId = findStageIdInScene(doc, sceneId);
  if (!stageId) return false;
  const bytes = dataUriToBytes(dataUri);
  if (!bytes || bytes.length === 0) return false;
  const ref = await editor.createImage(bytes);
  const stage = nodesOf(editor.state.document)[stageId];
  const width =
    typeof stage?.layout_target_width === "number"
      ? stage.layout_target_width
      : 1920;
  const height =
    typeof stage?.layout_target_height === "number"
      ? stage.layout_target_height
      : 1080;
  runEdit(() => {
    const stale = findBgVideoPosterIdsInScene(editor.state.document, sceneId);
    if (stale.length > 0) editor.commands.delete(stale);
    const inserted = editor.insert(
      {
        prototype: {
          type: "rectangle",
          name: RHEMA_BG_VIDEO_POSTER_NAME,
          locked: true,
          layout_positioning: "absolute",
          layout_inset_left: 0,
          layout_inset_top: 0,
          layout_target_width: width,
          layout_target_height: height,
          fill: {
            type: "solid",
            color: kolor.colorformats.RGBA32F.fromHEX("#00000000"),
            active: false,
          },
          fill_paints: [
            {
              type: "image",
              src: ref.url,
              fit: "cover",
              transform: cmath.transform.identity,
              filters: cg.def.IMAGE_FILTERS,
              blend_mode: cg.def.BLENDMODE,
              opacity: 1,
              active: true,
            } satisfies cg.ImagePaint,
          ],
        },
      },
      stageId
    );
    if (inserted[0]) {
      editor.commands.mv([inserted[0]], stageId, 0);
      editor.setUserData(inserted[0], {
        rhema_bg_video_poster_of: sourceBlobKey,
      });
    }
  });
  return true;
}

/**
 * Hide every poster while `fn` runs (save-time SVG export) and restore
 * afterwards. Toggles are wrapped by the caller's runProgrammaticEdit so the
 * flicker never arms the dirty flag. Restore is in a finally — an export
 * throw must not leave posters invisible.
 */
export async function hideBgVideoPostersDuring<T>(
  editor: Editor,
  runEdit: (fn: () => void) => void,
  fn: () => Promise<T>
): Promise<T> {
  const ids = findBgVideoPosterIds(editor.state.document).filter((id) => {
    const node = nodesOf(editor.state.document)[id];
    return node?.active !== false;
  });
  runEdit(() => {
    for (const id of ids) editor.commands.toggleNodeActive(id);
  });
  try {
    return await fn();
  } finally {
    runEdit(() => {
      for (const id of ids) editor.commands.toggleNodeActive(id);
    });
  }
}

/** Ask the BH host for the stored poster frame of `blobKey`. Resolves null
 *  on timeout / error / non-embedded contexts. */
export function requestBgVideoPosterFromHost(
  parentOrigin: string,
  blobKey: string,
  timeoutMs = 10_000
): Promise<string | null> {
  if (typeof window === "undefined" || window.parent === window) {
    return Promise.resolve(null);
  }
  const requestId = `thumb-${Math.random().toString(36).slice(2)}-${blobKey.slice(0, 8)}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(null);
    }, timeoutMs);
    const onMessage = (e: MessageEvent) => {
      if (parentOrigin !== "*" && e.origin !== parentOrigin) return;
      if (e.source !== window.parent) return;
      const d = e.data as {
        type?: unknown;
        payload?: {
          requestId?: unknown;
          ok?: unknown;
          thumbnailDataUri?: unknown;
        };
      } | null;
      if (!d || d.type !== GET_MEDIA_THUMB_RESULT_TYPE) return;
      const p = d.payload ?? {};
      if (p.requestId !== requestId) return;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      resolve(
        p.ok === true && typeof p.thumbnailDataUri === "string"
          ? p.thumbnailDataUri
          : null
      );
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage(
      { type: GET_MEDIA_THUMB_REQUEST_TYPE, payload: { requestId, blobKey } },
      parentOrigin
    );
  });
}

/** The scene's background-video reference ({blobKey} in scene userdata). */
export function readSceneBackgroundVideoBlobKey(
  doc: grida.program.document.Document,
  sceneId: string
): string | null {
  const ud = (
    doc as unknown as {
      metadata?: Record<string, { userdata?: Record<string, unknown> }>;
    }
  ).metadata?.[sceneId]?.userdata;
  const raw = ud?.[RHEMA_BACKGROUND_VIDEO_KEY] as
    | { blobKey?: unknown }
    | undefined;
  return raw && typeof raw.blobKey === "string" ? raw.blobKey : null;
}
