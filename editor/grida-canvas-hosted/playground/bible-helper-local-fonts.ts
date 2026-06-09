/**
 * Bible Helper — installed (system) fonts in the editor.
 *
 * The BH theme/stage editor runs on the WASM canvas backend, which renders text
 * from font BYTES (surface.addFont), not the OS font stack — and the packaged
 * host loads over file:// where queryLocalFonts is unavailable. So BH's main
 * process enumerates the operator's installed fonts and serves each face's bytes
 * over the `rhema-font://` protocol; this module turns that catalog into
 * ordinary GoogleWebFontListItem entries so they flow through the editor's
 * EXISTING font pipeline (getFontItem → fetch(files[variant]) → addFont) and
 * appear in the picker. No WASM-engine changes.
 */
import type { GoogleWebFontListItem } from "@grida/fonts/google";

export const BIBLE_HELPER_LIST_SYSTEM_FONTS_REQUEST =
  "bible-helper-list-system-fonts";
export const BIBLE_HELPER_LIST_SYSTEM_FONTS_RESULT =
  "bible-helper-list-system-fonts-result";

/** Marker category so the picker can render a local CSS preview instead of the
 *  Google preview image (which only exists for real Google families). */
export const LOCAL_FONT_CATEGORY = "system";

export interface BibleHelperSystemFontFace {
  styleKey: string;
  url: string;
  weight: number;
  italic: boolean;
}
export interface BibleHelperSystemFontFamily {
  family: string;
  faces: BibleHelperSystemFontFace[];
}

/** Convert the BH font catalog (families → faces with rhema-font:// urls) into
 *  GoogleWebFontListItem entries. Tolerant of malformed input. */
export function buildLocalWebfontItems(
  catalog: unknown
): GoogleWebFontListItem[] {
  if (!Array.isArray(catalog)) return [];
  const out: GoogleWebFontListItem[] = [];
  for (const raw of catalog) {
    if (!raw || typeof raw !== "object") continue;
    const family = (raw as { family?: unknown }).family;
    const faces = (raw as { faces?: unknown }).faces;
    if (typeof family !== "string" || !family.trim() || !Array.isArray(faces))
      continue;
    const files: { [variant: string]: string } = {};
    const variants: string[] = [];
    for (const face of faces) {
      if (
        face &&
        typeof face === "object" &&
        typeof (face as { styleKey?: unknown }).styleKey === "string" &&
        typeof (face as { url?: unknown }).url === "string"
      ) {
        const sk = (face as { styleKey: string }).styleKey;
        if (!(sk in files)) {
          files[sk] = (face as { url: string }).url;
          variants.push(sk);
        }
      }
    }
    if (variants.length === 0) continue;
    out.push({
      category: LOCAL_FONT_CATEGORY,
      family,
      variants,
      files,
      subsets: ["latin"],
      version: "local",
      lastModified: "",
      menu: files.regular ?? files[variants[0]] ?? "",
    });
  }
  return out;
}

/** The best file url to preview a local family with (regular weight, else the
 *  first available face). Null when none. */
export function localPreviewUrl(
  item: { files?: { [variant: string]: string } } | null | undefined
): string | null {
  if (!item || !item.files) return null;
  return (
    item.files.regular ??
    item.files["400"] ??
    Object.values(item.files)[0] ??
    null
  );
}
