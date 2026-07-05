const MAX_TRACKED_NOTES = 1000;

export class NoteDeduper {
  private readonly seen = new Set<string>();
  private readonly order: string[] = [];

  isDuplicate(noteId: string): boolean {
    if (this.seen.has(noteId)) {
      return true;
    }

    this.seen.add(noteId);
    this.order.push(noteId);

    if (this.order.length > MAX_TRACKED_NOTES) {
      const oldest = this.order.shift();
      if (oldest) {
        this.seen.delete(oldest);
      }
    }

    return false;
  }
}
