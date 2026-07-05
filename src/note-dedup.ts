export const DEFAULT_DEDUP_MAX = 1000;

export class NoteDeduper {
  private readonly processed = new Set<string>();
  private readonly order: string[] = [];
  private readonly inFlight = new Set<string>();

  constructor(private readonly maxSize = DEFAULT_DEDUP_MAX) {}

  tryAcquire(noteId: string): boolean {
    if (this.processed.has(noteId) || this.inFlight.has(noteId)) {
      return false;
    }

    this.inFlight.add(noteId);
    return true;
  }

  markForwarded(noteId: string): void {
    this.track(noteId);
  }

  markSkipped(noteId: string): void {
    this.track(noteId);
  }

  release(noteId: string): void {
    this.inFlight.delete(noteId);
  }

  private track(noteId: string): void {
    this.inFlight.delete(noteId);

    if (this.processed.has(noteId)) {
      return;
    }

    this.processed.add(noteId);
    this.order.push(noteId);

    if (this.order.length > this.maxSize) {
      const oldest = this.order.shift();
      if (oldest) {
        this.processed.delete(oldest);
      }
    }
  }
}
