import type { Metadata } from "next";
import Editor from "../../editor";

export const metadata: Metadata = {
  title: "Rhema Base",
  description: "Specialized Rhema canvas base for scripture design workflows",
};

export default async function BibleHelperBasePage({
  searchParams,
}: {
  searchParams: Promise<{
    room?: string;
    scene?: string;
    parentOrigin?: string;
  }>;
}) {
  const { room, scene, parentOrigin } = await searchParams;
  const roomId =
    typeof room === "string" && room.trim() ? room.trim() : "default";
  const initialSceneId =
    typeof scene === "string" && scene.trim() ? scene.trim() : undefined;

  // The Bible Helper opener stamps its origin onto the URL so we can use it
  // as the postMessage target instead of "*". Validated as a parseable http(s)
  // URL; anything else is dropped and saveThemeToBibleHelper will fail closed.
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

  return (
    <main className="w-screen h-screen overflow-hidden">
      <Editor
        backend="canvas"
        room_id={roomId}
        initialSceneId={initialSceneId}
        parentOrigin={validatedParentOrigin}
        profile="bible-helper"
        filekey={`rhema-base-v4-${roomId}`}
      />
    </main>
  );
}
