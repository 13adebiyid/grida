/**
 * Serializes Rhema's crash-draft writes against canonical saves.
 *
 * A save first invalidates the debounce generation and waits for any write
 * already inside OPFS. It clears the draft only if no newer operator edit
 * arrived during the save. Failed saves re-arm the current snapshot.
 */
export class RhemaDraftAutosaveCoordinator<T> {
  private readonly delayMs: number;
  private readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (timer: unknown) => void;
  private readonly writeDraft: (value: T) => Promise<void>;
  private readonly clearDraft: () => Promise<void>;
  private readonly onCleared?: () => void;
  private readonly onError?: (error: unknown) => void;
  private timer: unknown | null = null;
  private epoch = 0;
  private disposed = false;
  private tail: Promise<void> = Promise.resolve();

  constructor(options: {
    delayMs: number;
    setTimer?: (callback: () => void, delayMs: number) => unknown;
    clearTimer?: (timer: unknown) => void;
    writeDraft: (value: T) => Promise<void>;
    clearDraft: () => Promise<void>;
    onCleared?: () => void;
    onError?: (error: unknown) => void;
  }) {
    this.delayMs = options.delayMs;
    this.setTimer =
      options.setTimer ??
      ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer =
      options.clearTimer ??
      ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
    this.writeDraft = options.writeDraft;
    this.clearDraft = options.clearDraft;
    this.onCleared = options.onCleared;
    this.onError = options.onError;
  }

  private cancelTimer(): void {
    if (this.timer === null) return;
    this.clearTimer(this.timer);
    this.timer = null;
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const pending = this.tail.then(operation, operation);
    this.tail = pending.catch((error) => {
      this.onError?.(error);
    });
    return pending;
  }

  schedule(capture: () => T): void {
    if (this.disposed) return;
    const scheduledEpoch = ++this.epoch;
    this.cancelTimer();
    this.timer = this.setTimer(() => {
      this.timer = null;
      let value: T;
      try {
        value = capture();
      } catch (error) {
        this.onError?.(error);
        return;
      }
      void this.enqueue(async () => {
        if (this.disposed || this.epoch !== scheduledEpoch) return;
        await this.writeDraft(value);
      }).catch(() => {
        // The serialized tail reports through onError and stays usable.
      });
    }, this.delayMs);
  }

  async beginSave(): Promise<number> {
    if (this.disposed)
      throw new Error("draft autosave coordinator is disposed");
    const token = ++this.epoch;
    this.cancelTimer();
    await this.tail;
    return token;
  }

  async completeSave(token: number): Promise<boolean> {
    await this.tail;
    if (this.disposed || token !== this.epoch) return false;
    await this.clearDraft();
    if (this.disposed || token !== this.epoch) return false;
    this.onCleared?.();
    return true;
  }

  abortSave(token: number, capture: () => T): void {
    if (this.disposed || token !== this.epoch) return;
    this.schedule(capture);
  }

  async discard(): Promise<void> {
    if (this.disposed) return;
    ++this.epoch;
    this.cancelTimer();
    await this.tail;
    await this.clearDraft();
    this.onCleared?.();
  }

  async whenIdle(): Promise<void> {
    await this.tail;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    ++this.epoch;
    this.cancelTimer();
  }
}
