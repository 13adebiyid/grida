/**
 * Rhema background-video upload — shared by the document-properties
 * "Choose video…" picker AND the canvas drag-drop path (2026-07-07:
 * "drag a video into the editor" must land as the design's background
 * video; the wasm canvas cannot decode video in-canvas, and the theme
 * runtime already composites `rhema_background_video` on the live
 * output's media layer under the layers).
 *
 * Flow (the long-shipped picker bridge, extracted verbatim):
 *   1. read the file bytes
 *   2. postMessage `bible-helper-pick-media` (transferable bytes) to the
 *      Bible Helper host, which stores them in IndexedDB
 *   3. await `bible-helper-pick-media-result` carrying a stable blobKey
 *   4. stamp { blobKey, name, mimeType } on the CURRENT scene's userdata
 *      under `rhema_background_video` so it round-trips on reopen and
 *      lands in the runtime payload via buildRhemaThemeRuntimeJson.
 *
 * The string constants mirror grida-canvas-hosted/playground/rhema-contract.ts
 * (this module lives one layer below and keeps its own copies, matching
 * how use-data-transfer.ts carries RHEMA_STAGE_NAME).
 */
import { toast } from "sonner";
import type { Editor } from "@/grida-canvas/editor";

const PICK_MEDIA_REQUEST_TYPE = "bible-helper-pick-media";
const PICK_MEDIA_RESULT_TYPE = "bible-helper-pick-media-result";
const RHEMA_BACKGROUND_VIDEO_KEY = "rhema_background_video";

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v"]);

/** True when the file smells like a droppable video (MIME or extension). */
export function isVideoFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("video/")) return true;
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

function resolveParentOrigin(): string {
  try {
    const parentOrigin = new URLSearchParams(window.location.search).get(
      "parentOrigin"
    );
    if (parentOrigin) {
      const parsed = new URL(parentOrigin);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.origin;
      }
    }
  } catch {
    // ignore malformed parentOrigin
  }
  const ancestor = window.location.ancestorOrigins?.[0];
  if (ancestor && ancestor.trim()) return ancestor;
  return "*";
}

export interface UploadBackgroundVideoResult {
  ok: boolean;
  error?: string;
}

/**
 * Ship `file` to Bible Helper over the pick-media bridge and stamp the
 * returned blobKey on `sceneId`'s userdata as the background video.
 * Resolves after the round-trip; shows success/error toasts itself so
 * both call sites (picker + drop) speak with one voice.
 */
export async function uploadRhemaBackgroundVideo(
  editor: Editor,
  sceneId: string,
  file: File
): Promise<UploadBackgroundVideoResult> {
  const parentOrigin = resolveParentOrigin();
  const requestId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `bgvid-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch (err) {
    console.error("[bg-video] failed to read file", err);
    toast.error("Could not read the selected video.");
    return { ok: false, error: "read-failed" };
  }

  return new Promise<UploadBackgroundVideoResult>((resolve) => {
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data as
        | {
            type?: string;
            payload?: {
              requestId?: string;
              ok?: boolean;
              blobKey?: string;
              name?: string;
              mimeType?: string;
              error?: string;
            };
          }
        | undefined;
      if (
        !data ||
        data.type !== PICK_MEDIA_RESULT_TYPE ||
        data.payload?.requestId !== requestId
      ) {
        return;
      }
      window.removeEventListener("message", onMessage);
      clearTimeout(timeout);
      const payload = data.payload;
      if (payload?.ok && typeof payload.blobKey === "string") {
        const current = (editor.getUserData(sceneId) ?? {}) as Record<
          string,
          unknown
        >;
        editor.setUserData(sceneId, {
          ...current,
          [RHEMA_BACKGROUND_VIDEO_KEY]: {
            blobKey: payload.blobKey,
            name: payload.name ?? file.name,
            mimeType: payload.mimeType ?? (file.type || undefined),
          },
        });
        toast.success(
          "Background video added — it plays under the layers on the live output."
        );
        resolve({ ok: true });
      } else {
        toast.error(
          payload?.error ? `Upload failed: ${payload.error}` : "Upload failed."
        );
        resolve({ ok: false, error: payload?.error ?? "upload-failed" });
      }
    };

    // Guard against a silent bridge (BH not listening / older build).
    const timeout = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      toast.error("Upload timed out — no response from Bible Helper.");
      resolve({ ok: false, error: "timeout" });
    }, 60_000);

    window.addEventListener("message", onMessage);
    window.parent.postMessage(
      {
        type: PICK_MEDIA_REQUEST_TYPE,
        payload: {
          requestId,
          name: file.name,
          mimeType: file.type || "video/mp4",
          bytes,
        },
      },
      parentOrigin,
      [bytes]
    );
  });
}
