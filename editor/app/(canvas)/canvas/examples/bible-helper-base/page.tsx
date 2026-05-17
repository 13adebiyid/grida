import type { Metadata } from "next";
import Editor from "../../editor";

export const metadata: Metadata = {
  title: "Rhema Base",
  description: "Specialized Rhema canvas base for scripture design workflows",
};

export default async function BibleHelperBasePage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string; scene?: string }>;
}) {
  const { room, scene } = await searchParams;
  const roomId =
    typeof room === "string" && room.trim() ? room.trim() : "default";
  const initialSceneId =
    typeof scene === "string" && scene.trim() ? scene.trim() : undefined;

  return (
    <main className="w-screen h-screen overflow-hidden">
      <Editor
        backend="canvas"
        room_id={roomId}
        initialSceneId={initialSceneId}
        profile="bible-helper"
        filekey={`rhema-base-v4-${roomId}`}
      />
    </main>
  );
}
