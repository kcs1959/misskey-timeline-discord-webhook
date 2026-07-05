import { config as loadDotenv } from 'dotenv';

loadDotenv();

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
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
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
  const misskeyOrigin = requireEnv('MISSKEY_ORIGIN').replace(/\/$/, '');
  const misskeyToken = process.env.MISSKEY_TOKEN?.trim() || null;
  const discordWebhookUrl = requireEnv('DISCORD_WEBHOOK_URL');
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
  };
}
