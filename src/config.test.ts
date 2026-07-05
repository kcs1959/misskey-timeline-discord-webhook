import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { loadConfig } from './config.js';

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

  it('parses tuning env vars with defaults', () => {
    process.env.MISSKEY_ORIGIN = 'https://misskey.example.com';
    process.env.DISCORD_WEBHOOK_URL =
      'https://discord.com/api/webhooks/1/token';
    delete process.env.DEDUP_MAX;
    delete process.env.DISCORD_QUEUE_MAX;
    delete process.env.DISCORD_SEND_INTERVAL_MS;

    const config = loadConfig();

    assert.equal(config.dedupMax, 1000);
    assert.equal(config.discordQueueMax, 500);
    assert.equal(config.discordSendIntervalMs, 2000);
  });

  it('rejects invalid tuning env vars', () => {
    process.env.MISSKEY_ORIGIN = 'https://misskey.example.com';
    process.env.DISCORD_WEBHOOK_URL =
      'https://discord.com/api/webhooks/1/token';
    process.env.DEDUP_MAX = '0';

    assert.throws(() => loadConfig(), /DEDUP_MAX must be a positive integer/);
  });
});
