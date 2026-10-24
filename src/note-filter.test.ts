import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { entities } from 'misskey-js';

import {
  getForwardBlockReason,
  noteHasCw,
  noteHasSensitiveMedia,
  noteIsReply,
} from './note-filter.js';

function createFile(
  overrides: Partial<entities.DriveFile> = {},
): entities.DriveFile {
  return {
    id: 'file1',
    name: 'photo.png',
    type: 'image/png',
    url: '/files/photo.png',
    isSensitive: false,
    ...overrides,
  } as entities.DriveFile;
}

function createNote(overrides: Partial<entities.Note> = {}): entities.Note {
  return {
    id: 'note1',
    text: 'Hello',
    cw: null,
    files: [],
    renote: null,
    ...overrides,
  } as entities.Note;
}

describe('noteHasCw', () => {
  it('detects CW on the note itself', () => {
    assert.equal(noteHasCw(createNote({ cw: 'warning' })), true);
  });

  it('detects CW on a quoted renote', () => {
    assert.equal(
      noteHasCw(createNote({ renote: createNote({ cw: 'warning' }) })),
      true,
    );
  });
});

describe('noteHasSensitiveMedia', () => {
  it('detects sensitive files on the note or renote', () => {
    assert.equal(
      noteHasSensitiveMedia(
        createNote({ files: [createFile({ isSensitive: true })] }),
      ),
      true,
    );
    assert.equal(
      noteHasSensitiveMedia(
        createNote({
          renote: createNote({ files: [createFile({ isSensitive: true })] }),
        }),
      ),
      true,
    );
  });
});

describe('noteIsReply', () => {
  it('detects reply notes by replyId or nested reply', () => {
    assert.equal(noteIsReply(createNote({ replyId: 'parent1' })), true);
    assert.equal(
      noteIsReply(createNote({ reply: createNote({ id: 'parent1' }) })),
      true,
    );
    assert.equal(noteIsReply(createNote()), false);
  });
});

describe('getForwardBlockReason', () => {
  it('blocks CW notes when FORWARD_CW is false', () => {
    assert.equal(
      getForwardBlockReason(createNote({ cw: 'warning' }), {
        forwardCw: false,
        forwardNsfw: true,
        forwardReplies: true,
      }),
      'CW',
    );
  });

  it('blocks NSFW notes when FORWARD_NSFW is false', () => {
    assert.equal(
      getForwardBlockReason(
        createNote({ files: [createFile({ isSensitive: true })] }),
        {
          forwardCw: true,
          forwardNsfw: false,
          forwardReplies: true,
        },
      ),
      'NSFW',
    );
  });

  it('blocks reply notes when FORWARD_REPLIES is false', () => {
    assert.equal(
      getForwardBlockReason(createNote({ replyId: 'parent1' }), {
        forwardCw: true,
        forwardNsfw: true,
        forwardReplies: false,
      }),
      'reply',
    );
  });

  it('always blocks notes hidden from anonymous viewers', () => {
    assert.equal(
      getForwardBlockReason(createNote({ text: null, isHidden: true }), {
        forwardCw: true,
        forwardNsfw: true,
        forwardReplies: true,
      }),
      'hidden',
    );
  });

  it('blocks pure renotes of hidden notes but not quotes of them', () => {
    const hidden = createNote({ id: 'note2', text: null, isHidden: true });
    const policy = { forwardCw: true, forwardNsfw: true, forwardReplies: true };

    assert.equal(
      getForwardBlockReason(createNote({ text: null, renote: hidden }), policy),
      'hidden',
    );
    assert.equal(
      getForwardBlockReason(
        createNote({ text: 'Look at this', renote: hidden }),
        policy,
      ),
      null,
    );
  });

  it('allows safe notes through', () => {
    assert.equal(
      getForwardBlockReason(createNote(), {
        forwardCw: true,
        forwardNsfw: false,
        forwardReplies: true,
      }),
      null,
    );
  });
});
