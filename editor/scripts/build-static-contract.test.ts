import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(relative, import.meta.url)),
    "utf8"
  );
}

describe("Bible Helper static-export page contract", () => {
  it("uses the deterministic production bundler path", () => {
    const buildScript = source("./build-static.mjs");
    const nextConfig = source("../next.config.ts");

    expect(buildScript).toContain('["exec", "next", "build", "--webpack"]');
    expect(buildScript).not.toContain('from "next/font/google"');
    expect(buildScript).toContain('"lib/ai/actions/image.ts":');
    expect(buildScript).toContain('"lib/supabase/server.ts":');
    expect(nextConfig).toContain("NormalModuleReplacementPlugin");
    expect(nextConfig).toContain("/^node:(fs|crypto)$/");
    expect(nextConfig).toContain(
      'generateBuildId: async () => "rhema-embedded-editor"'
    );
  });

  it("builds the real runtime-param page instead of an inline shadow copy", () => {
    const buildScript = source("./build-static.mjs");
    const page = source(
      "../app/(canvas)/canvas/examples/bible-helper-base/page.tsx"
    );

    expect(buildScript).not.toMatch(
      /["']app\/\(canvas\)\/canvas\/examples\/bible-helper-base\/page\.tsx["']\s*:/
    );
    expect(page).toContain('"use client"');
    expect(page).toContain("<Suspense");
    expect(page).toContain("validateRhemaParentOrigin(");
  });
});
