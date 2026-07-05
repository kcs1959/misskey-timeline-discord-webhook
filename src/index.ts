import { Stream } from 'misskey-js';
import type { Channels, IChannelConnection } from 'misskey-js';

import { loadConfig, type TimelineChannel } from './config.js';
import { DiscordWebhookQueue } from './discord-queue.js';
import { buildDiscordPayload } from './discord.js';

const config = loadConfig();
const discordQueue = new DiscordWebhookQueue();

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
    void (async () => {
      try {
        const payload = buildDiscordPayload(note, config.misskeyOrigin);
        await discordQueue.enqueue(config.discordWebhookUrl, payload);
        console.log(`Forwarded note ${note.id} by ${note.user.username}`);
      } catch (error) {
        console.error(`Failed to forward note ${note.id}:`, error);
      }
    })();
  });
}

stream.on('_connected_', () => {
  attachChannel();
  console.log(`Connected to ${config.misskeyOrigin} (${config.timeline})`);
});

stream.on('_disconnected_', () => {
  console.warn('Disconnected from Misskey streaming API');
  channel?.dispose();
  channel = undefined;
});

function shutdown(): void {
  console.log('Shutting down...');
  channel?.dispose();
  stream.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`Listening to ${config.timeline} on ${config.misskeyOrigin}`);
