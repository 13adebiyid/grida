import { describe, expect, it, vi } from "vitest";
import { fetchVerifiedExternalAsset } from "./rhema-external-assets";

async function digest(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const value = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(value), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

describe("fetchVerifiedExternalAsset", () => {
  it("accepts CAS bytes only when size and digest match", async () => {
    const bytes = new TextEncoder().encode("verified image bytes");
    const ref = await digest(bytes);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(bytes, {
            status: 200,
            headers: { "content-length": String(bytes.byteLength) },
          })
      )
    );
    await expect(
      fetchVerifiedExternalAsset({
        ref,
        url: `rhema-local://asset/${ref}/Photo.png`,
        bytes: bytes.byteLength,
        mimeType: "image/png",
        name: "Photo.png",
      })
    ).resolves.toEqual(bytes);
    vi.unstubAllGlobals();
  });

  it("rejects bytes that do not match the requested digest", async () => {
    const bytes = new TextEncoder().encode("tampered");
    const ref = "a".repeat(64);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(bytes, { status: 200 }))
    );
    await expect(
      fetchVerifiedExternalAsset({
        ref,
        url: `rhema-local://asset/${ref}/Photo.png`,
        bytes: bytes.byteLength,
        mimeType: "image/png",
        name: "Photo.png",
      })
    ).rejects.toThrow("digest mismatch");
    vi.unstubAllGlobals();
  });
});
