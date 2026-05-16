import type { Metadata } from "next";
import Editor from "../../editor";

export const metadata: Metadata = {
  title: "Rhema Base",
  description: "Specialized Rhema canvas base for scripture design workflows",
};

export default async function BibleHelperBasePage({
  searchParams,
}: {
  searchParams: Promise<{ room: string }>;
}) {
  const { room } = await searchParams;

  return (
    <main className="w-screen h-screen overflow-hidden">
      <Editor
        backend="canvas"
        room_id={room}
        profile="bible-helper"
        filekey="rhema-base-v4"
      />
    </main>
  );
}
