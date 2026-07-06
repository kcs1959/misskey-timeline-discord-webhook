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
    host: null,
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
    createdAt: '2026-01-01T00:00:00.000Z',
    user: createUser(),
    files: [],
    renote: null,
    ...overrides,
  } as entities.Note;
}

function mainEmbed(payload: ReturnType<typeof buildDiscordPayload>) {
  return payload.embeds?.[0];
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
  it('builds a basic text note payload as a rich embed', () => {
    const payload = buildDiscordPayload(createNote(), origin);

    assert.equal(payload.content, undefined);
    assert.equal(payload.username, 'Display Name');
    assert.equal(payload.avatar_url, 'https://misskey.example.com/avatar.png');
    assert.deepEqual(payload.allowed_mentions, { parse: [] });

    const embed = mainEmbed(payload);
    assert.match(embed?.description ?? '', /Hello/);
    assert.equal(embed?.url, 'https://misskey.example.com/notes/note1');
    assert.equal(embed?.timestamp, '2026-01-01T00:00:00.000Z');
    assert.equal(embed?.author?.name, 'alice');
    assert.equal(
      embed?.author?.icon_url,
      'https://misskey.example.com/avatar.png',
    );
    assert.equal(embed?.author?.url, 'https://misskey.example.com/@alice');
  });

  it('wraps CW note text in Discord spoilers', () => {
    const payload = buildDiscordPayload(
      createNote({ cw: 'warning', text: 'hidden text' }),
      origin,
    );

    const description = mainEmbed(payload)?.description ?? '';
    assert.match(description, /\*\*CW: warning\*\*/);
    assert.match(description, /\|\|hidden text\|\|/);
  });

  it('includes the first image as the main embed image', () => {
    const payload = buildDiscordPayload(
      createNote({ files: [createFile()] }),
      origin,
    );

    assert.equal(payload.embeds?.length, 1);
    assert.equal(
      mainEmbed(payload)?.image?.url,
      'https://misskey.example.com/files/photo.png',
    );
  });

  it('groups additional images into gallery embeds sharing the note URL', () => {
    const payload = buildDiscordPayload(
      createNote({
        files: [
          createFile(),
          createFile({
            id: 'file2',
            name: 'photo2.png',
            url: '/files/photo2.png',
          }),
        ],
      }),
      origin,
    );

    assert.equal(payload.embeds?.length, 2);
    assert.equal(
      mainEmbed(payload)?.image?.url,
      'https://misskey.example.com/files/photo.png',
    );
    assert.equal(
      payload.embeds?.[1]?.image?.url,
      'https://misskey.example.com/files/photo2.png',
    );
    assert.equal(
      payload.embeds?.[1]?.url,
      'https://misskey.example.com/notes/note1',
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
      mainEmbed(payload)?.image?.url,
      'https://misskey.example.com/files/renote.jpg',
    );
    assert.match(mainEmbed(payload)?.description ?? '', /original/);
  });

  it('renders sensitive images as spoiler links instead of embeds', () => {
    const payload = buildDiscordPayload(
      createNote({ files: [createFile({ isSensitive: true })] }),
      origin,
    );

    assert.equal(payload.embeds?.length, 1);
    assert.equal(mainEmbed(payload)?.image, undefined);
    const description = mainEmbed(payload)?.description ?? '';
    assert.match(description, /\*\*Sensitive media:\*\*/);
    assert.match(
      description,
      /\|\|\[Sensitive image\]\(https:\/\/misskey\.example\.com\/files\/photo\.png\)\|\|/,
    );
  });

  it('truncates the embed description longer than the Discord limit', () => {
    const payload = buildDiscordPayload(
      createNote({ text: 'a'.repeat(5000) }),
      origin,
    );

    const description = mainEmbed(payload)?.description ?? '';
    assert.equal(description.length, 4096);
    assert.match(description, /…$/);
  });

  it('closes unclosed spoiler markers when truncating', () => {
    const payload = buildDiscordPayload(
      createNote({ cw: 'warning', text: 'x'.repeat(5000) }),
      origin,
    );

    const description = mainEmbed(payload)?.description ?? '';
    const spoilerCount = (description.match(/\|\|/g) ?? []).length;
    assert.equal(spoilerCount % 2, 0);
    assert.equal(description.length, 4096);
  });

  it('adds overflow attachments as links', () => {
    const files = Array.from({ length: 11 }, (_, index) =>
      createFile({
        id: `file${String(index)}`,
        name: `photo${String(index)}.png`,
        url: `/files/photo${String(index)}.png`,
      }),
    );
    const payload = buildDiscordPayload(createNote({ files }), origin);

    // 1 main embed image + 9 gallery embeds (10 embed cap) = 10 total.
    assert.equal(payload.embeds?.length, 10);
    const description = mainEmbed(payload)?.description ?? '';
    assert.match(description, /\*\*Attachments:\*\*/);
    assert.match(
      description,
      /\[photo10\.png\]\(https:\/\/misskey\.example\.com\/files\/photo10\.png\)/,
    );
  });

  it('omits attachments when includeAttachments is false', () => {
    const payload = buildDiscordPayload(
      createNote({
        text: 'hello',
        files: [createFile(), createFile({ id: 'file2', isSensitive: true })],
      }),
      origin,
      { includeAttachments: false },
    );

    assert.equal(payload.embeds?.length, 1);
    assert.equal(mainEmbed(payload)?.image, undefined);
    const description = mainEmbed(payload)?.description ?? '';
    assert.doesNotMatch(description, /Sensitive media|Attachments/);
    assert.match(description, /hello/);
  });

  it('includes a reply link when the note is a reply', () => {
    const payload = buildDiscordPayload(
      createNote({ replyId: 'parent1', text: 'thanks' }),
      origin,
    );

    assert.match(
      mainEmbed(payload)?.description ?? '',
      /\*\*Reply to:\*\* https:\/\/misskey\.example\.com\/notes\/parent1/,
    );
  });

  it('truncates long webhook usernames', () => {
    const payload = buildDiscordPayload(
      createNote({
        user: createUser({ name: 'n'.repeat(100) }),
      }),
      origin,
    );

    assert.equal(payload.username?.length, 80);
    assert.match(payload.username ?? '', /…$/);
  });

  it('truncates long embed titles', () => {
    const payload = buildDiscordPayload(
      createNote({
        files: [
          createFile({
            type: 'application/pdf',
            name: 'f'.repeat(300) + '.pdf',
            url: '/files/long-name.pdf',
          }),
        ],
      }),
      origin,
    );

    assert.equal(payload.embeds?.[1]?.title?.length, 256);
    assert.match(payload.embeds?.[1]?.title ?? '', /…$/);
  });

  it('moves oversized embeds to attachment links', () => {
    const longUrl = `${origin}/files/${'a'.repeat(7000)}.png`;
    const payload = buildDiscordPayload(
      createNote({
        files: [createFile(), createFile({ id: 'file2', url: longUrl })],
      }),
      origin,
    );

    assert.equal(payload.embeds?.length, 1);
    const description = mainEmbed(payload)?.description ?? '';
    assert.match(description, /\*\*Attachments:\*\*/);
    assert.match(description, /\[Image\]\(/);
  });

  it('includes poll choices as text', () => {
    const payload = buildDiscordPayload(
      createNote({
        text: 'Which one?',
        poll: {
          multiple: false,
          choices: [
            { text: 'A', votes: 3, isVoted: false },
            { text: 'B', votes: 1, isVoted: false },
            { text: 'C', votes: 0, isVoted: false },
          ],
          expiresAt: '2026-12-31T00:00:00.000Z',
        },
      }),
      origin,
    );

    const description = mainEmbed(payload)?.description ?? '';
    assert.match(description, /\*\*Poll:\*\*/);
    assert.match(description, /1\. A \(3 votes\)/);
    assert.match(description, /2\. B \(1 votes\)/);
    assert.match(description, /Expires: 2026-12-31T00:00:00.000Z/);
  });

  it('links the author name to a remote profile when the user is remote', () => {
    const payload = buildDiscordPayload(
      createNote({
        user: createUser({ username: 'bob', host: 'remote.example' }),
      }),
      origin,
    );

    assert.equal(mainEmbed(payload)?.author?.name, 'bob@remote.example');
    assert.equal(
      mainEmbed(payload)?.author?.url,
      'https://misskey.example.com/@bob@remote.example',
    );
  });
});
