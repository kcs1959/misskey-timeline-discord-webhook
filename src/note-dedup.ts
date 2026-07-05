const MAX_TRACKED_NOTES = 1000;

export class NoteDeduper {
  private readonly forwarded = new Set<string>();
  private readonly order: string[] = [];
  private readonly inFlight = new Set<string>();

  tryAcquire(noteId: string): boolean {
    if (this.forwarded.has(noteId) || this.inFlight.has(noteId)) {
      return false;
    }

    this.inFlight.add(noteId);
    return true;
  }

  markForwarded(noteId: string): void {
    this.inFlight.delete(noteId);

    if (this.forwarded.has(noteId)) {
      return;
    }

    this.forwarded.add(noteId);
    this.order.push(noteId);

    if (this.order.length > MAX_TRACKED_NOTES) {
      const oldest = this.order.shift();
      if (oldest) {
        this.forwarded.delete(oldest);
      }
    }
  }

  release(noteId: string): void {
    this.inFlight.delete(noteId);
  }
}
