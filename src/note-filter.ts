import type { entities } from 'misskey-js';

export type ForwardPolicy = {
  forwardCw: boolean;
  forwardNsfw: boolean;
  forwardReplies: boolean;
};

export function noteIsReply(note: entities.Note): boolean {
  return Boolean(note.replyId ?? note.reply?.id);
}

export function collectNoteFiles(note: entities.Note): entities.DriveFile[] {
  return [...(note.files ?? []), ...(note.renote?.files ?? [])];
}

export function noteHasCw(note: entities.Note): boolean {
  return Boolean(note.cw?.trim()) || Boolean(note.renote?.cw?.trim());
}

export function noteHasSensitiveMedia(note: entities.Note): boolean {
  return collectNoteFiles(note).some((file) => file.isSensitive);
}

function isPureRenote(note: entities.Note): boolean {
  return (
    note.renote != null &&
    !note.text &&
    !note.cw &&
    (note.files ?? []).length === 0 &&
    !note.poll
  );
}

// Misskey strips text/CW/files/poll and sets `isHidden` when the viewer may not
// see the note (e.g. the author requires sign-in). We stream anonymously, so
// such notes (and pure renotes of them) carry nothing worth forwarding.
export function noteIsHidden(note: entities.Note): boolean {
  if (note.isHidden) {
    return true;
  }
  return isPureRenote(note) && Boolean(note.renote?.isHidden);
}

export function getForwardBlockReason(
  note: entities.Note,
  policy: ForwardPolicy,
): 'hidden' | 'CW' | 'NSFW' | 'reply' | null {
  if (noteIsHidden(note)) {
    return 'hidden';
  }
  if (!policy.forwardCw && noteHasCw(note)) {
    return 'CW';
  }
  if (!policy.forwardNsfw && noteHasSensitiveMedia(note)) {
    return 'NSFW';
  }
  if (!policy.forwardReplies && noteIsReply(note)) {
    return 'reply';
  }
  return null;
}
