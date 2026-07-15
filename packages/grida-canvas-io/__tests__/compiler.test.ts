import grida from "@grida/schema";
import { compilerIO } from "../compiler";

function fixtureDocument(): grida.program.document.Document {
  const sceneId = "scene-1";
  return {
    nodes: {
      [sceneId]: {
        type: "scene",
        id: sceneId,
        name: "Slide 1",
        active: true,
        locked: false,
        guides: [],
        edges: [],
        constraints: { children: "multiple" },
      },
    },
    links: { [sceneId]: [] },
    scenes_ref: [sceneId],
    entry_scene_id: sceneId,
    images: {},
    bitmaps: {},
    properties: {
      "fixture:property": { type: "string", default: "preserved" },
    },
    metadata: {
      [sceneId]: {
        userdata: {
          rhema_workspace: "slide",
          rhema_stage_node_id: "stage-1",
        },
      },
    },
  };
}

describe("compilerIO repack", () => {
  it("preserves documented JSON-only state beside the binary projection", () => {
    const source = fixtureDocument();
    const repacked = compilerIO.repack(compilerIO.snapshot(source));
    const snapshot = JSON.parse(repacked.snapshotJson) as {
      document: grida.program.document.Document;
    };

    expect(snapshot.document.entry_scene_id).toBe("scene-1");
    expect(snapshot.document.properties).toEqual(source.properties);
    expect(snapshot.document.metadata).toEqual(source.metadata);
    expect(compilerIO.unpack(repacked.archive).snapshotJson).toBe(
      repacked.snapshotJson
    );
    expect(
      compilerIO.decode(compilerIO.unpack(repacked.archive).document)
    ).toEqual(
      compilerIO.decode(
        compilerIO.encode(source, grida.program.document.SCHEMA_VERSION)
      )
    );
  });

  it("refuses snapshots without an explicit matching schema version", () => {
    const versionless = JSON.stringify({ document: fixtureDocument() });
    expect(() => compilerIO.repack(versionless)).toThrow(
      "snapshot schema is incompatible with the compiler ABI"
    );
  });
});
