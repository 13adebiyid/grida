import { compilerIO } from "@grida/io/compiler";
import grida from "@grida/schema";
import {
  buildRhemaSaveDocumentPayload,
  serializeRhemaEditorSnapshot,
} from "./rhema-save-document";

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
      "fixture:property": { type: "string", default: "retained" },
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

describe("Rhema save-document bridge", () => {
  it("emits a schema-pinned snapshot identical to the archive sidecar", () => {
    const document = fixtureDocument();
    const payload = buildRhemaSaveDocumentPayload({
      document,
      images: { "fixture.png": new Uint8Array([1, 2, 3, 4]) },
    });
    const snapshot = JSON.parse(payload.snapshotJson) as {
      version: string;
      document: grida.program.document.Document;
    };
    const archive = compilerIO.unpack(new Uint8Array(payload.archiveBytes));

    expect(snapshot.version).toBe(grida.program.document.SCHEMA_VERSION);
    expect(archive.snapshotJson).toBe(payload.snapshotJson);
    expect(snapshot.document.metadata?.["scene-1"]?.userdata).toMatchObject({
      rhema_workspace: "slide",
      rhema_stage_node_id: "stage-1",
    });
    expect(() =>
      compilerIO.repack(payload.snapshotJson, [
        new Uint8Array(payload.archiveBytes),
      ])
    ).not.toThrow();
  });

  it("pins full OPFS and draft snapshots without dropping repositories", () => {
    const document = fixtureDocument();
    document.images.fixture = {
      type: "image/png",
      url: "blob:fixture",
      width: 1,
      height: 1,
      bytes: 4,
    };
    const snapshot = JSON.parse(serializeRhemaEditorSnapshot(document)) as {
      version: string;
      document: grida.program.document.Document;
    };

    expect(snapshot.version).toBe(grida.program.document.SCHEMA_VERSION);
    expect(snapshot.document.images.fixture).toEqual(document.images.fixture);
  });
});
