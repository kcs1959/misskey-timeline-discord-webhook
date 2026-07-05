import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { entities } from 'misskey-js';

import { buildDiscordPayload, toAbsoluteUrl } from './discord.js';

const origin = 'https://misskey.example.com';

function createUser(
  overrides: Partial<entities.UserLite> = {},
): entities.UserLite {
  return {
    id: 'user1',
    name: 'Display Name',
    username: 'alice',
    host: 'misskey.example.com',
    avatarUrl: '/avatar.png',
    ...overrides,
  } as entities.UserLite;
}

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
    user: createUser(),
    files: [],
    renote: null,
    ...overrides,
  } as entities.Note;
}

describe('toAbsoluteUrl', () => {
  it('returns undefined for empty values', () => {
    assert.equal(toAbsoluteUrl(null, origin), undefined);
    assert.equal(toAbsoluteUrl(undefined, origin), undefined);
  });

  it('returns absolute URLs unchanged', () => {
    assert.equal(
      toAbsoluteUrl('https://cdn.example.com/a.png', origin),
      'https://cdn.example.com/a.png',
    );
  });

  it('prepends origin to relative paths', () => {
    assert.equal(
      toAbsoluteUrl('/avatar.png', origin),
      'https://misskey.example.com/avatar.png',
    );
  });
});

describe('buildDiscordPayload', () => {
  it('builds a basic text note payload', () => {
    const payload = buildDiscordPayload(createNote(), origin);

    assert.equal(payload.username, 'Display Name');
    assert.equal(payload.avatar_url, 'https://misskey.example.com/avatar.png');
    assert.match(payload.content ?? '', /Hello/);
    assert.match(
      payload.content ?? '',
      /https:\/\/misskey\.example\.com\/notes\/note1/,
    );
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
  });

  it('wraps CW note text in Discord spoilers', () => {
    const payload = buildDiscordPayload(
      createNote({ cw: 'warning', text: 'hidden text' }),
      origin,
    );

    assert.match(payload.content ?? '', /\*\*CW: warning\*\*/);
    assert.match(payload.content ?? '', /\|\|hidden text\|\|/);
  });

  it('includes image embeds with absolute URLs', () => {
    const payload = buildDiscordPayload(
      createNote({ files: [createFile()] }),
      origin,
    );

    assert.equal(payload.embeds?.length, 1);
    assert.equal(
      payload.embeds?.[0]?.image?.url,
      'https://misskey.example.com/files/photo.png',
    );
  });

  it('includes renote file embeds', () => {
    const payload = buildDiscordPayload(
      createNote({
        text: null,
        renote: createNote({
          id: 'renote1',
          text: 'original',
          files: [createFile({ name: 'renote.jpg', url: '/files/renote.jpg' })],
        }),
      }),
      origin,
    );

    assert.equal(payload.embeds?.length, 1);
    assert.equal(
      payload.embeds?.[0]?.image?.url,
      'https://misskey.example.com/files/renote.jpg',
    );
    assert.match(payload.content ?? '', /original/);
  });

  it('renders sensitive images as spoiler links instead of embeds', () => {
    const payload = buildDiscordPayload(
      createNote({ files: [createFile({ isSensitive: true })] }),
      origin,
    );

    assert.equal(payload.embeds, undefined);
    assert.match(payload.content ?? '', /\*\*Sensitive media:\*\*/);
    assert.match(
      payload.content ?? '',
      /\|\|\[Sensitive image\]\(https:\/\/misskey\.example\.com\/files\/photo\.png\)\|\|/,
    );
  });

  it('truncates content longer than the Discord limit', () => {
    const payload = buildDiscordPayload(
      createNote({ text: 'a'.repeat(2500) }),
      origin,
    );

    assert.equal(payload.content?.length, 2000);
    assert.match(payload.content ?? '', /…$/);
  });
});
