import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { DiscordWebhookQueue, QueueFullError } from './discord-queue.js';
import { DiscordWebhookError } from './discord.js';

const originalFetch = globalThis.fetch;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('DiscordWebhookQueue', () => {
  it('rejects enqueue when the queue is full', async () => {
    let releaseFirst: (() => void) | undefined;
    const firstSendGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    globalThis.fetch = async () => {
      await firstSendGate;
      return new Response(null, { status: 204 });
    };

    const queue = new DiscordWebhookQueue(1);
    const first = queue.enqueue('https://discord.com/api/webhooks/1/token', {
      content: 'first',
    });

    await sleep(20);

    await assert.rejects(
      () =>
        queue.enqueue('https://discord.com/api/webhooks/1/token', {
          content: 'second',
        }),
      QueueFullError,
    );

    assert.equal(queue.droppedTotal, 1);

    releaseFirst?.();
    await first;
  });

  it('drains pending items', async () => {
    globalThis.fetch = () =>
      Promise.resolve(new Response(null, { status: 204 }));

    const queue = new DiscordWebhookQueue();
    await queue.enqueue('https://discord.com/api/webhooks/1/token', {
      content: 'hello',
    });
    await queue.drain();

    assert.equal(queue.pendingCount, 0);
  });

  it('does not retry non-retryable 4xx errors', async () => {
    let attempts = 0;
    globalThis.fetch = () => {
      attempts++;
      return Promise.resolve(new Response('bad request', { status: 400 }));
    };

    const queue = new DiscordWebhookQueue();
    await assert.rejects(
      () =>
        queue.enqueue('https://discord.com/api/webhooks/1/token', {
          content: 'hello',
        }),
      DiscordWebhookError,
    );

    assert.equal(attempts, 1);
  });

  it('retries 429 responses', async () => {
    let attempts = 0;
    globalThis.fetch = () => {
      attempts++;
      if (attempts === 1) {
        return Promise.resolve(
          new Response('rate limited', {
            status: 429,
            headers: { 'Retry-After': '0' },
          }),
        );
      }
      return Promise.resolve(new Response(null, { status: 204 }));
    };

    const queue = new DiscordWebhookQueue();
    await queue.enqueue('https://discord.com/api/webhooks/1/token', {
      content: 'hello',
    });

    assert.equal(attempts, 2);
  });
});
