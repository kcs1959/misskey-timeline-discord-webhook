import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { loadConfig } from './config.js';
import { NoteDeduper } from './note-dedup.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('loadConfig', () => {
  it('rejects invalid Discord webhook URLs', () => {
    process.env.MISSKEY_ORIGIN = 'https://misskey.example.com';
    process.env.DISCORD_WEBHOOK_URL = 'https://example.com/not-a-webhook';

    assert.throws(() => loadConfig(), /DISCORD_WEBHOOK_URL/);
  });

  it('requires a token for homeTimeline', () => {
    process.env.MISSKEY_ORIGIN = 'https://misskey.example.com';
    process.env.DISCORD_WEBHOOK_URL =
      'https://discord.com/api/webhooks/1/token';
    process.env.TIMELINE = 'homeTimeline';
    delete process.env.MISSKEY_TOKEN;

    assert.throws(() => loadConfig(), /MISSKEY_TOKEN is required/);
  });
});

describe('NoteDeduper', () => {
  it('allows a note through once and blocks after forwarding', () => {
    const deduper = new NoteDeduper();

    assert.equal(deduper.tryAcquire('note1'), true);
    assert.equal(deduper.tryAcquire('note1'), false);

    deduper.markForwarded('note1');
    assert.equal(deduper.tryAcquire('note1'), false);
  });

  it('allows retry after release', () => {
    const deduper = new NoteDeduper();

    assert.equal(deduper.tryAcquire('note1'), true);
    deduper.release('note1');
    assert.equal(deduper.tryAcquire('note1'), true);
  });
});
