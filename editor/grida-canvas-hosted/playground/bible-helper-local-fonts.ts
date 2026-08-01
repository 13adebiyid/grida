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

export interface BibleHelperGoogleFontCss {
  family: string;
  css: string;
}

function variantKey(weight: number, italic: boolean): string {
  if (weight === 400) return italic ? "italic" : "regular";
  return italic ? `${weight}italic` : String(weight);
}

/** Convert the host's fixed-origin Google CSS response into the same registry
 * shape as an installed family. Rhema requests one weight per URL with a
 * generic UA, producing static TrueType faces instead of variable/subset
 * WOFF2 faces that the WASM renderer can mis-index. */
export function buildGoogleCssWebfontItems(
  responses: unknown
): GoogleWebFontListItem[] {
  if (!Array.isArray(responses)) return [];
  const out: GoogleWebFontListItem[] = [];
  for (const raw of responses) {
    if (!raw || typeof raw !== "object") continue;
    const family = (raw as { family?: unknown }).family;
    const css = (raw as { css?: unknown }).css;
    if (typeof family !== "string" || !family.trim() || typeof css !== "string")
      continue;
    const files: Record<string, string> = {};
    const variants: string[] = [];
    for (const match of css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
      const body = match[1] ?? "";
      const weightMatch = body.match(/font-weight\s*:\s*(\d{3})/i);
      const styleMatch = body.match(/font-style\s*:\s*(italic|normal)/i);
      const urlMatch = body.match(
        /url\(\s*['"]?(https:\/\/fonts\.gstatic\.com\/[^'"\s)]+)['"]?\s*\)/i
      );
      if (!weightMatch || !urlMatch) continue;
      const weight = Number(weightMatch[1]);
      if (!Number.isFinite(weight)) continue;
      const key = variantKey(
        weight,
        styleMatch?.[1]?.toLowerCase() === "italic"
      );
      if (!(key in files)) {
        files[key] = urlMatch[1];
        variants.push(key);
      }
    }
    if (variants.length === 0) continue;
    out.push({
      category: LOCAL_FONT_CATEGORY,
      family: family.trim(),
      variants,
      files,
      subsets: ["latin"],
      version: "rhema-google-static-v1",
      lastModified: "",
      menu: files.regular ?? files[variants[0]],
    });
  }
  return out;
}

export function findPreferredMissingFamilyFallback(
  items: ReadonlyArray<GoogleWebFontListItem>,
  preferredFallbacks: ReadonlyArray<string> = ["Times New Roman", "Times"]
): GoogleWebFontListItem | null {
  return (
    preferredFallbacks
      .map((family) =>
        items.find(
          (item) =>
            item.family.toLocaleLowerCase() === family.toLocaleLowerCase()
        )
      )
      .find((item): item is GoogleWebFontListItem => item !== undefined) ?? null
  );
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

/**
 * The browser output uses the CSS font stack: if an imported ProPresenter
 * family is not installed, it falls back to the platform serif face. The WASM
 * canvas cannot perform that OS fallback because it only renders registered
 * bytes. Alias the same local serif bytes under each missing document family
 * so editor and output remain visually consistent. Installed source families
 * always win and are never replaced.
 */
export function withMissingFamilyFallbacks(
  items: ReadonlyArray<GoogleWebFontListItem>,
  requiredFamilies: ReadonlyArray<string>,
  preferredFallbacks: ReadonlyArray<string> = ["Times New Roman", "Times"]
): GoogleWebFontListItem[] {
  const out = [...items];
  const present = new Set(items.map((item) => item.family.toLocaleLowerCase()));
  const fallback = findPreferredMissingFamilyFallback(
    items,
    preferredFallbacks
  );
  if (!fallback) return out;
  for (const rawFamily of requiredFamilies) {
    const family = rawFamily.trim();
    const key = family.toLocaleLowerCase();
    if (!family || present.has(key)) continue;
    out.push({
      ...fallback,
      family,
      version: `local-fallback:${fallback.family}`,
    });
    present.add(key);
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
