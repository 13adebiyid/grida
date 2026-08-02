import { describe, expect, it } from "vitest";
import { RhemaDraftAutosaveCoordinator } from "./rhema-draft-autosave";

function harness() {
  let scheduled: (() => void) | null = null;
  const writes: string[] = [];
  const clears: string[] = [];
  const coordinator = new RhemaDraftAutosaveCoordinator<string>({
    delayMs: 1,
    setTimer: (callback) => {
      scheduled = callback;
      return 1;
    },
    clearTimer: () => {
      scheduled = null;
    },
    writeDraft: async (value) => {
      writes.push(value);
    },
    clearDraft: async () => {
      clears.push("clear");
    },
  });
  return {
    coordinator,
    writes,
    clears,
    fire: () => {
      const callback = scheduled;
      scheduled = null;
      callback?.();
    },
  };
}

describe("RhemaDraftAutosaveCoordinator", () => {
  it("cancels a pending autosave before clearing the canonical save", async () => {
    const h = harness();
    h.coordinator.schedule(() => "pending edit");

    const token = await h.coordinator.beginSave();
    expect(await h.coordinator.completeSave(token)).toBe(true);
    h.fire();
    await h.coordinator.whenIdle();

    expect(h.writes).toEqual([]);
    expect(h.clears).toEqual(["clear"]);
  });

  it("waits for an already-started draft write before the save may clear it", async () => {
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writeStarted = false;
    const order: string[] = [];
    let scheduled: (() => void) | null = null;
    const coordinator = new RhemaDraftAutosaveCoordinator<string>({
      delayMs: 1,
      setTimer: (callback) => {
        scheduled = callback;
        return 1;
      },
      clearTimer: () => {
        scheduled = null;
      },
      writeDraft: async () => {
        writeStarted = true;
        order.push("write-start");
        await started;
        order.push("write-end");
      },
      clearDraft: async () => {
        order.push("clear");
      },
    });
    coordinator.schedule(() => "edit");
    const fireScheduled = scheduled as (() => void) | null;
    expect(fireScheduled).not.toBeNull();
    fireScheduled!();
    await Promise.resolve();
    expect(writeStarted).toBe(true);

    let began = false;
    const beginning = coordinator.beginSave().then((token) => {
      began = true;
      return token;
    });
    await Promise.resolve();
    expect(began).toBe(false);
    release();
    const token = await beginning;
    await coordinator.completeSave(token);

    expect(order).toEqual(["write-start", "write-end", "clear"]);
  });

  it("does not clear a newer edit that lands while a save is in flight", async () => {
    const h = harness();
    const token = await h.coordinator.beginSave();
    h.coordinator.schedule(() => "newer edit");

    expect(await h.coordinator.completeSave(token)).toBe(false);
    expect(h.clears).toEqual([]);
    h.fire();
    await h.coordinator.whenIdle();
    expect(h.writes).toEqual(["newer edit"]);
  });

  it("re-arms the current draft when a canonical save fails", async () => {
    const h = harness();
    const token = await h.coordinator.beginSave();
    h.coordinator.abortSave(token, () => "recover me");
    h.fire();
    await h.coordinator.whenIdle();

    expect(h.writes).toEqual(["recover me"]);
    expect(h.clears).toEqual([]);
  });
});
