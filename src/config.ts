import { config as loadDotenv } from 'dotenv';

export type TimelineChannel =
  'localTimeline' | 'globalTimeline' | 'homeTimeline' | 'hybridTimeline';

export type Config = {
  misskeyOrigin: string;
  misskeyToken: string | null;
  discordWebhookUrl: string;
  timeline: TimelineChannel;
  withRenotes: boolean;
  withReplies: boolean;
  withFiles: boolean;
  forwardCw: boolean;
  forwardNsfw: boolean;
  forwardReplies: boolean;
  dedupMax: number;
  discordQueueMax: number;
  discordSendIntervalMs: number;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseHttpOrigin(name: string, value: string): string {
  const trimmed = value.replace(/\/$/, '');
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} must use http or https`);
  }
  return trimmed;
}

function parseDiscordWebhookUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DISCORD_WEBHOOK_URL must be a valid URL');
  }
  const host = url.hostname;
  if (
    host !== 'discord.com' &&
    host !== 'discordapp.com' &&
    !host.endsWith('.discord.com')
  ) {
    throw new Error('DISCORD_WEBHOOK_URL must be a Discord webhook URL');
  }
  if (!url.pathname.includes('/api/webhooks/')) {
    throw new Error('DISCORD_WEBHOOK_URL must be a Discord webhook URL');
  }
  return value;
}

function parseBoolean(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return value === '1' || value.toLowerCase() === 'true';
}

function parsePositiveInt(
  name: string,
  value: string | undefined,
  defaultValue: number,
): number {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function parseTimeline(value: string | undefined): TimelineChannel {
  const timeline = value ?? 'localTimeline';
  const allowed: TimelineChannel[] = [
    'localTimeline',
    'globalTimeline',
    'homeTimeline',
    'hybridTimeline',
  ];
  if (!allowed.includes(timeline as TimelineChannel)) {
    throw new Error(
      `Invalid TIMELINE value: ${timeline}. Allowed: ${allowed.join(', ')}`,
    );
  }
  return timeline as TimelineChannel;
}

export function loadConfig(): Config {
  loadDotenv();

  const misskeyOrigin = parseHttpOrigin(
    'MISSKEY_ORIGIN',
    requireEnv('MISSKEY_ORIGIN'),
  );
  const misskeyToken = process.env.MISSKEY_TOKEN?.trim() || null;
  const discordWebhookUrl = parseDiscordWebhookUrl(
    requireEnv('DISCORD_WEBHOOK_URL'),
  );
  const timeline = parseTimeline(process.env.TIMELINE);

  if (
    (timeline === 'homeTimeline' || timeline === 'hybridTimeline') &&
    !misskeyToken
  ) {
    throw new Error(`MISSKEY_TOKEN is required for ${timeline}`);
  }

  return {
    misskeyOrigin,
    misskeyToken,
    discordWebhookUrl,
    timeline,
    withRenotes: parseBoolean(process.env.WITH_RENOTES, true),
    withReplies: parseBoolean(process.env.WITH_REPLIES, true),
    withFiles: parseBoolean(process.env.WITH_FILES, true),
    forwardCw: parseBoolean(process.env.FORWARD_CW, true),
    forwardNsfw: parseBoolean(process.env.FORWARD_NSFW, false),
    forwardReplies: parseBoolean(process.env.FORWARD_REPLIES, true),
    dedupMax: parsePositiveInt('DEDUP_MAX', process.env.DEDUP_MAX, 1000),
    discordQueueMax: parsePositiveInt(
      'DISCORD_QUEUE_MAX',
      process.env.DISCORD_QUEUE_MAX,
      500,
    ),
    discordSendIntervalMs: parsePositiveInt(
      'DISCORD_SEND_INTERVAL_MS',
      process.env.DISCORD_SEND_INTERVAL_MS,
      2000,
    ),
  };
}
