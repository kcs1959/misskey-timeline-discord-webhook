import { Stream } from 'misskey-js';
import type { Channels, IChannelConnection } from 'misskey-js';
import { unlinkSync, writeFileSync } from 'node:fs';

import { loadConfig, type TimelineChannel } from './config.js';
import { DiscordWebhookQueue, QueueFullError } from './discord-queue.js';
import { buildDiscordPayload } from './discord.js';
import { getForwardBlockReason } from './note-filter.js';
import { NoteDeduper } from './note-dedup.js';

const config = loadConfig();
const discordQueue = new DiscordWebhookQueue();
const noteDeduper = new NoteDeduper();
const HEALTH_FILE = '/tmp/healthy';
let shuttingDown = false;

function markHealthy(): void {
  writeFileSync(HEALTH_FILE, 'ok');
}

function markUnhealthy(): void {
  try {
    unlinkSync(HEALTH_FILE);
  } catch {
    // ignore missing health file
  }
}

const stream = new Stream(
  config.misskeyOrigin,
  config.misskeyToken ? { token: config.misskeyToken } : null,
);

const channelParams =
  config.timeline === 'localTimeline' || config.timeline === 'hybridTimeline'
    ? {
        withRenotes: config.withRenotes,
        withReplies: config.withReplies,
        withFiles: config.withFiles,
      }
    : {
        withRenotes: config.withRenotes,
        withFiles: config.withFiles,
      };

let channel: IChannelConnection<Channels[TimelineChannel]> | undefined;

function attachChannel(): void {
  if (channel) {
    return;
  }

  channel = stream.useChannel(config.timeline, channelParams);

  channel.on('note', (note) => {
    if (!noteDeduper.tryAcquire(note.id)) {
      console.log(`Skipping duplicate note ${note.id}`);
      return;
    }

    const blockReason = getForwardBlockReason(note, {
      forwardCw: config.forwardCw,
      forwardNsfw: config.forwardNsfw,
    });
    if (blockReason) {
      noteDeduper.release(note.id);
      console.log(`Skipping note ${note.id} (${blockReason} content filtered)`);
      return;
    }

    void (async () => {
      try {
        const payload = buildDiscordPayload(note, config.misskeyOrigin);
        await discordQueue.enqueue(config.discordWebhookUrl, payload);
        noteDeduper.markForwarded(note.id);
        console.log(`Forwarded note ${note.id} by ${note.user.username}`);
      } catch (error) {
        noteDeduper.release(note.id);
        if (error instanceof QueueFullError) {
          console.warn(`Dropped note ${note.id}: ${error.message}`);
          return;
        }
        console.error(`Failed to forward note ${note.id}:`, error);
      }
    })();
  });
}

stream.on('_connected_', () => {
  attachChannel();
  markHealthy();
  console.log(`Connected to ${config.misskeyOrigin} (${config.timeline})`);
});

stream.on('_disconnected_', () => {
  console.warn('Disconnected from Misskey streaming API');
  markUnhealthy();
  channel?.dispose();
  channel = undefined;
});

function shutdown(): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  void (async () => {
    console.log('Shutting down...');
    markUnhealthy();
    channel?.dispose();
    stream.close();
    await discordQueue.drain();
    process.exit(0);
  })();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`Listening to ${config.timeline} on ${config.misskeyOrigin}`);
