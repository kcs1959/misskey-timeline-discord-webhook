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

export function getForwardBlockReason(
  note: entities.Note,
  policy: ForwardPolicy,
): 'CW' | 'NSFW' | 'reply' | null {
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
