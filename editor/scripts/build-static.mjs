// Static-export build orchestrator for Bible Helper's Path A integration.
//
// Parks all `app/(*)` route groups except `(canvas)` (plus sitemap.ts) into
// `_app_excluded/`, runs `next build` with STATIC_EXPORT=1, then ALWAYS restores
// them via the finally block — even on build failure.
//
// Run from this script's package directory: `cd editor && node scripts/build-static.mjs`
// or `pnpm run build:static`. Paths inside this script are relative to editor/.

import {
  renameSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const APP_DIR = "app";
const PARK_DIR = "_app_excluded";
const SNAPSHOT_DIR = "_app_excluded/.snapshots";
const SNAPSHOT_MAP = "_app_excluded/.snapshots/index.json";
const LOCK = ".build-static.lock";

function flattenPath(rel) {
  return rel.replace(/[\\/]/g, "__");
}

const ROUTE_GROUPS = [
  "(api)",
  "(auth)",
  "(canvas)",
  "(demo)",
  "(dev)",
  "(embed)",
  "(ingest)",
  "(insiders)",
  "(library)",
  "(preview)",
  "(site)",
  "(tenant)",
  "(theme)",
  "(tools)",
  "(workbench)",
  "(workspace)",
  "(www)",
];
const KEEP = new Set(["(canvas)"]);
const ALSO_PARK_FILES = ["sitemap.ts"];

// Additional surgery WITHIN (canvas) — we only need the bible-helper-base entry,
// not the other example pages, dynamic routes, or experimental tools. Paths
// relative to APP_DIR. Includes dynamic-param routes that would need
// generateStaticParams() under static export.
const EXTRA_PARK_PATHS = [
  "(canvas)/canvas/examples/[example]",
  "(canvas)/canvas/examples/inset",
  "(canvas)/canvas/examples/minimal",
  "(canvas)/canvas/examples/network",
  "(canvas)/canvas/examples/with-templates",
  "(canvas)/canvas/experimental",
  "(canvas)/canvas/room",
  "(canvas)/canvas/slides",
  "(canvas)/canvas/tools",
];

// Specific files (not whole subdirs) to park. These are page.tsx files that
// use server-only APIs (cookies(), headers(), etc.) and would fail prerender.
const EXTRA_PARK_FILES = [
  "(canvas)/canvas/page.tsx", // uses cookies() — not part of bible-helper-base flow
];

const parkedDirs = [];
const parkedFiles = [];
const parkedExtras = []; // [{relPathInApp, parkPath}]

// Files OUTSIDE the app/ tree (in lib/, grida-canvas-hosted/, etc.) that carry
// "use server" directives. Static export bans Server Actions — even unused ones
// reachable from the build graph. We strip the directive and snapshot originals
// for restore; the modules become regular imports that are dead-code in the
// bible-helper-base flow.
const STRIP_USE_SERVER_FILES = [
  "lib/ai/actions/audio.ts",
  "lib/ai/actions/chat.ts",
  "lib/ai/actions/forms-schema.ts",
  "lib/ai/actions/image-generate.ts",
  "lib/ai/actions/image.ts",
  "lib/ai/actions/models.ts",
  "lib/ai/credits/actions.ts",
  "grida-canvas-hosted/library/lib-photos-actions.ts",
];

// Files that import "server-only" — these throw at build when imported from
// Client Components. We strip the import (the module becomes a normal one).
const STRIP_SERVER_ONLY_FILES = ["lib/ai/server.ts", "lib/ai/credits/actions.ts"];

// Whole-file content swaps for build duration. Used for layout/components that
// call dynamic server APIs (cookies(), headers()) but only need a defaulted
// stub for the bible-helper-base flow.
const FILE_SWAPS = {
  // Convert bible-helper-base page to a Client Component that reads URL params
  // at runtime. Server-side `await searchParams` forces dynamic rendering, which
  // is incompatible with `output: "export"`.
  "app/(canvas)/canvas/examples/bible-helper-base/page.tsx": `"use client";
import { useSearchParams } from "next/navigation";
import { useMemo, Suspense } from "react";
import Editor from "../../editor";

// Static-export stub: read params client-side instead of server-side.
// Restored by build-static.mjs after build.

function BibleHelperBaseInner() {
  const searchParams = useSearchParams();
  const { roomId, initialSceneId, validatedParentOrigin } = useMemo(() => {
    const room = searchParams.get("room");
    const scene = searchParams.get("scene");
    const parentOrigin = searchParams.get("parentOrigin");
    const roomId =
      typeof room === "string" && room.trim() ? room.trim() : "default";
    const initialSceneId =
      typeof scene === "string" && scene.trim() ? scene.trim() : undefined;
    let validatedParentOrigin: string | undefined;
    if (typeof parentOrigin === "string" && parentOrigin.trim()) {
      try {
        const parsed = new URL(parentOrigin.trim());
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          validatedParentOrigin = parsed.origin;
        }
      } catch {
        // ignore malformed parentOrigin
      }
    }
    return { roomId, initialSceneId, validatedParentOrigin };
  }, [searchParams]);

  return (
    <main className="w-screen h-screen overflow-hidden">
      <Editor
        backend="canvas"
        room_id={roomId}
        initialSceneId={initialSceneId}
        parentOrigin={validatedParentOrigin}
        profile="bible-helper"
        filekey={\`rhema-base-v4-\${roomId}\`}
      />
    </main>
  );
}

export default function BibleHelperBasePage() {
  return (
    <Suspense fallback={null}>
      <BibleHelperBaseInner />
    </Suspense>
  );
}
`,
  "app/(canvas)/layout.tsx": `import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import PlatformProvider from "@/host/platform-provider";
import "../editor.css";

// Static-export stub: skip cookies()-driven platform detection; default to web.
// Restored by build-static.mjs after build.

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Grida",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <Toaster position="bottom-center" />
          <PlatformProvider application="web" desktop_app_platform={null} desktop_app_version={null}>
            <TooltipProvider>{children}</TooltipProvider>
          </PlatformProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
`,
};

const strippedSnapshots = new Map(); // path -> original content (in-memory mirror of on-disk snapshots)

// Persist a pre-mutation snapshot to disk so that a SIGKILL/power-loss leaves
// `--recover` able to reconstruct the working tree. Idempotent: only the FIRST
// snapshot for a given path is persisted (subsequent strip passes would
// overwrite with already-mutated content).
function persistSnapshot(rel, originalContent) {
  if (strippedSnapshots.has(rel)) return;
  strippedSnapshots.set(rel, originalContent);
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const flat = flattenPath(rel);
  writeFileSync(join(SNAPSHOT_DIR, `${flat}.bak`), originalContent);
  const currentMap = Object.fromEntries(
    Array.from(strippedSnapshots.keys()).map((k) => [k, `${flattenPath(k)}.bak`]),
  );
  writeFileSync(SNAPSHOT_MAP, JSON.stringify(currentMap, null, 2));
}

// Sanitize a relative app-path into a flat filename safe for PARK_DIR.
// Avoids nested mkdir requirements (parens, slashes flattened with `__`).
function flattenKey(relPath) {
  return relPath.replace(/[\\/]/g, "__");
}

function park() {
  // Partial-state guard: if _app_excluded/ exists and is non-empty, a prior
  // build crashed mid-restore. Refuse to start a new build that would mix
  // current app/() state with stranded prior-run files. The operator must
  // run `--recover` first.
  if (existsSync(PARK_DIR)) {
    const stale = readdirSync(PARK_DIR);
    if (stale.length > 0) {
      throw new Error(
        `${PARK_DIR}/ contains ${stale.length} stranded entries from a prior crash: ${stale.join(", ")}.\n` +
          `Run: node scripts/build-static.mjs --recover`,
      );
    }
  }

  // Drift guard: enumerate app/(*) groups on disk and fail loudly if a new
  // one shows up that's not in our ROUTE_GROUPS allowlist. Otherwise a
  // future Grida change could silently include a server-only route in the
  // static export build graph.
  const onDiskGroups = readdirSync(APP_DIR).filter(
    (e) => e.startsWith("(") && e.endsWith(")"),
  );
  const unknown = onDiskGroups.filter((g) => !ROUTE_GROUPS.includes(g));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown app/() route group(s) — update ROUTE_GROUPS in build-static.mjs: ${unknown.join(", ")}`,
    );
  }

  mkdirSync(PARK_DIR, { recursive: true });
  for (const g of ROUTE_GROUPS) {
    if (KEEP.has(g)) continue;
    const from = join(APP_DIR, g);
    const to = join(PARK_DIR, g);
    if (existsSync(from)) {
      renameSync(from, to);
      parkedDirs.push(g);
    }
  }
  for (const f of ALSO_PARK_FILES) {
    const from = join(APP_DIR, f);
    const to = join(PARK_DIR, f);
    if (existsSync(from)) {
      renameSync(from, to);
      parkedFiles.push(f);
    }
  }
  for (const rel of EXTRA_PARK_PATHS) {
    const from = join(APP_DIR, rel);
    if (!existsSync(from)) continue;
    const parkName = flattenKey(rel);
    const to = join(PARK_DIR, parkName);
    renameSync(from, to);
    parkedExtras.push({ relPathInApp: rel, parkPath: parkName });
  }
  for (const rel of EXTRA_PARK_FILES) {
    const from = join(APP_DIR, rel);
    if (!existsSync(from)) continue;
    const parkName = flattenKey(rel);
    const to = join(PARK_DIR, parkName);
    renameSync(from, to);
    parkedExtras.push({ relPathInApp: rel, parkPath: parkName });
  }
  for (const rel of STRIP_USE_SERVER_FILES) {
    if (!existsSync(rel)) continue;
    const original = readFileSync(rel, "utf8");
    persistSnapshot(rel, original);
    // Replace top-of-file "use server" with a comment so the file becomes a
    // regular module. Match either single or double quotes, with or without
    // semicolon, optionally indented or preceded by whitespace/newlines.
    const stripped = original.replace(
      /^\s*["']use server["'];?\s*$/m,
      "// 'use server' — stripped by build-static.mjs for STATIC_EXPORT"
    );
    writeFileSync(rel, stripped);
  }
  for (const rel of STRIP_SERVER_ONLY_FILES) {
    if (!existsSync(rel)) continue;
    const original = readFileSync(rel, "utf8");
    persistSnapshot(rel, original);
    // Strip `import "server-only";` lines.
    const stripped = original.replace(
      /^\s*import\s+["']server-only["'];?\s*$/m,
      "// import 'server-only' — stripped by build-static.mjs for STATIC_EXPORT"
    );
    writeFileSync(rel, stripped);
  }
  for (const [rel, replacement] of Object.entries(FILE_SWAPS)) {
    if (!existsSync(rel)) continue;
    persistSnapshot(rel, readFileSync(rel, "utf8"));
    writeFileSync(rel, replacement);
  }
}

function restore() {
  for (const g of parkedDirs) {
    const from = join(PARK_DIR, g);
    const to = join(APP_DIR, g);
    if (existsSync(from)) renameSync(from, to);
  }
  for (const f of parkedFiles) {
    const from = join(PARK_DIR, f);
    const to = join(APP_DIR, f);
    if (existsSync(from)) renameSync(from, to);
  }
  for (const extra of parkedExtras) {
    const from = join(PARK_DIR, extra.parkPath);
    const to = join(APP_DIR, extra.relPathInApp);
    if (existsSync(from)) {
      // Parent directory in APP_DIR may not exist yet if the original was at depth>1.
      const parent = to.split(/[\\/]/).slice(0, -1).join("/");
      if (parent) mkdirSync(parent, { recursive: true });
      renameSync(from, to);
    }
  }
  // Best-effort cleanup for un-tracked parked entries (defensive against
  // park() partial-failures): top-level entries restored by name only.
  if (existsSync(PARK_DIR)) {
    for (const entry of readdirSync(PARK_DIR)) {
      const from = join(PARK_DIR, entry);
      const to = join(APP_DIR, entry);
      if (!existsSync(to) && !entry.includes("__")) {
        renameSync(from, to);
      }
    }
  }
  // Restore content-mutated files from in-memory snapshots, then drop the
  // persisted on-disk backups (no longer needed after successful restore).
  for (const [path, original] of strippedSnapshots) {
    writeFileSync(path, original);
  }
  strippedSnapshots.clear();
  if (existsSync(SNAPSHOT_DIR)) {
    rmSync(SNAPSHOT_DIR, { recursive: true, force: true });
  }
}

// `--recover` flag: run restore-only logic (best-effort sweep of
// _app_excluded/) without starting a new build. Use after SIGKILL / power loss
// to repair the working tree.
if (process.argv.includes("--recover")) {
  console.log("Running recovery sweep — restoring any stray parked files...");
  const unresolved = [];

  // Step 1: restore content-mutated files from persisted disk snapshots.
  // The snapshot index maps original-path → backup-filename. We restore the
  // original contents from each .bak and remove the snapshot dir at the end.
  if (existsSync(SNAPSHOT_MAP)) {
    let snapshotIndex;
    try {
      snapshotIndex = JSON.parse(readFileSync(SNAPSHOT_MAP, "utf8"));
    } catch (e) {
      console.error(`  snapshot index ${SNAPSHOT_MAP} unreadable: ${e.message}`);
      unresolved.push(`snapshot-index: ${SNAPSHOT_MAP}`);
      snapshotIndex = {};
    }
    for (const [originalPath, backupName] of Object.entries(snapshotIndex)) {
      const backupFile = join(SNAPSHOT_DIR, backupName);
      if (!existsSync(backupFile)) {
        console.error(`  missing backup file: ${backupFile} (for ${originalPath})`);
        unresolved.push(`missing-backup: ${originalPath}`);
        continue;
      }
      try {
        writeFileSync(originalPath, readFileSync(backupFile, "utf8"));
        console.log(`  restored content: ${originalPath}`);
      } catch (e) {
        console.error(`  failed to restore ${originalPath}: ${e.message}`);
        unresolved.push(`content-restore-failed: ${originalPath}`);
      }
    }
  }

  // Step 2: restore parked directories/files.
  if (existsSync(PARK_DIR)) {
    for (const entry of readdirSync(PARK_DIR)) {
      // Skip the snapshot directory (already handled above).
      if (entry === ".snapshots") continue;
      const from = join(PARK_DIR, entry);
      const to = join(APP_DIR, entry);
      // Heuristic: top-level non-flattened entries (no '__') are route groups
      // or single files; flattened entries (with '__') were nested paths we
      // can't safely auto-restore — surface them.
      if (entry.includes("__")) {
        console.warn(
          `  manual: ${from} — flattened from a nested path. Move it back to its original location in app/.`,
        );
        unresolved.push(`flattened: ${from}`);
        continue;
      }
      if (!existsSync(to)) {
        renameSync(from, to);
        console.log(`  restored: ${to}`);
      } else {
        console.warn(`  skipped: ${to} already exists`);
        unresolved.push(`collision: ${from} -> ${to}`);
      }
    }
  }

  // Step 3: clean up snapshot dir only when all content restores succeeded.
  if (
    existsSync(SNAPSHOT_DIR) &&
    !unresolved.some((u) => u.startsWith("missing-backup") || u.startsWith("content-restore-failed"))
  ) {
    rmSync(SNAPSHOT_DIR, { recursive: true, force: true });
  }

  if (existsSync(LOCK)) {
    rmSync(LOCK, { force: true });
    console.log(`  removed stale lock: ${LOCK}`);
  }
  if (unresolved.length > 0) {
    console.error(
      `\nRecovery PARTIAL — ${unresolved.length} entries need manual action:`,
    );
    for (const u of unresolved) console.error(`  - ${u}`);
    console.error(
      `\nAddress the items above (move parked files back manually), then re-run \`--recover\` to confirm a clean state.`,
    );
    process.exit(1);
  }
  console.log("Recovery complete.");
  process.exit(0);
}

if (existsSync(LOCK)) {
  console.error(
    `Lock file ${LOCK} exists. Another build is running, or a previous build crashed mid-restore.`
  );
  console.error(
    `If you're sure nothing is running, run: node scripts/build-static.mjs --recover`
  );
  process.exit(1);
}
writeFileSync(LOCK, `${process.pid}\n${new Date().toISOString()}\n`);

try {
  park();
  const r = spawnSync("pnpm", ["exec", "next", "build"], {
    stdio: "inherit",
    env: { ...process.env, STATIC_EXPORT: "1" },
    shell: true,
  });
  if (r.status !== 0) process.exitCode = r.status ?? 1;

  const expected = join(
    "out",
    "canvas",
    "examples",
    "bible-helper-base",
    "index.html"
  );
  if (!existsSync(expected)) {
    console.error(`Static export missing expected entry: ${expected}`);
    process.exitCode = 1;
  } else {
    console.log(`Static export OK: ${expected}`);
  }
} finally {
  restore();
  rmSync(LOCK, { force: true });
}
