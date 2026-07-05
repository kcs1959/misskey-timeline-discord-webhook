import { acct, entities } from 'misskey-js';

const DISCORD_CONTENT_LIMIT = 2000;
const DISCORD_EMBED_LIMIT = 10;

type DiscordEmbed = {
  title?: string;
  description?: string;
  url?: string;
  image?: { url: string };
};

type DiscordWebhookPayload = {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds?: DiscordEmbed[];
  allowed_mentions?: { parse: [] };
};

export type { DiscordWebhookPayload };

export class DiscordWebhookError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(message: string, status: number, retryAfterMs: number | null) {
    super(message);
    this.name = 'DiscordWebhookError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (!Number.isNaN(seconds)) {
    return seconds * 1000;
  }

  const retryAt = Date.parse(value);
  if (!Number.isNaN(retryAt)) {
    return Math.max(0, retryAt - Date.now());
  }

  return null;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

export function toAbsoluteUrl(
  url: string | null | undefined,
  origin: string,
): string | undefined {
  if (!url) {
    return undefined;
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (url.startsWith('/')) {
    return `${origin}${url}`;
  }
  return url;
}

function formatUserName(user: entities.UserLite): string {
  return acct.toString(user);
}

function wrapSpoiler(text: string): string {
  return `||${text}||`;
}

function formatQuotedNote(note: entities.Note, origin: string): string {
  const user = formatUserName(note.user);
  const lines = [`> **${user}**`];

  if (note.cw) {
    lines.push(`> CW: ${note.cw}`);
  }
  if (note.text) {
    for (const line of note.text.split('\n')) {
      lines.push(note.cw ? `> ${wrapSpoiler(line)}` : `> ${line}`);
    }
  }
  if (!note.text && !note.cw) {
    lines.push('> (内容なし)');
  }

  lines.push(`> ${origin}/notes/${note.id}`);
  return lines.join('\n');
}

function appendFileContent(
  embeds: DiscordEmbed[],
  sensitiveLines: string[],
  overflowLines: string[],
  files: entities.DriveFile[] | undefined,
  origin: string,
): void {
  for (const file of files ?? []) {
    const fileUrl = toAbsoluteUrl(file.url, origin);
    if (!fileUrl) {
      continue;
    }

    if (file.isSensitive) {
      const label = file.type.startsWith('image/')
        ? 'Sensitive image'
        : file.name;
      sensitiveLines.push(`||[${label}](${fileUrl})||`);
      continue;
    }

    if (embeds.length >= DISCORD_EMBED_LIMIT) {
      overflowLines.push(`[${file.name}](${fileUrl})`);
      continue;
    }

    if (file.type.startsWith('image/')) {
      embeds.push({ image: { url: fileUrl } });
    } else {
      embeds.push({
        title: file.name,
        url: fileUrl,
      });
    }
  }
}

function collectMedia(
  note: entities.Note,
  origin: string,
): {
  embeds: DiscordEmbed[];
  sensitiveLines: string[];
  overflowLines: string[];
} {
  const embeds: DiscordEmbed[] = [];
  const sensitiveLines: string[] = [];
  const overflowLines: string[] = [];

  appendFileContent(embeds, sensitiveLines, overflowLines, note.files, origin);
  if (note.renote) {
    appendFileContent(
      embeds,
      sensitiveLines,
      overflowLines,
      note.renote.files,
      origin,
    );
  }

  return { embeds, sensitiveLines, overflowLines };
}

export function buildDiscordPayload(
  note: entities.Note,
  origin: string,
): DiscordWebhookPayload {
  const lines: string[] = [];

  if (note.cw) {
    lines.push(`**CW: ${note.cw}**`);
    lines.push('');
  }

  if (note.text) {
    lines.push(note.cw ? wrapSpoiler(note.text) : note.text);
  }

  if (note.renote) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(formatQuotedNote(note.renote, origin));
  }

  const { embeds, sensitiveLines, overflowLines } = collectMedia(note, origin);
  if (sensitiveLines.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push('**Sensitive media:**');
    lines.push(...sensitiveLines);
  }
  if (overflowLines.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push('**Attachments:**');
    lines.push(...overflowLines);
  }

  lines.push('');
  lines.push(`${origin}/notes/${note.id}`);

  const content = truncate(lines.join('\n').trim(), DISCORD_CONTENT_LIMIT);

  return {
    content: content || undefined,
    username: note.user.name || note.user.username,
    avatar_url: toAbsoluteUrl(note.user.avatarUrl, origin),
    embeds: embeds.length > 0 ? embeds : undefined,
    allowed_mentions: { parse: [] },
  };
}

export async function sendToDiscord(
  webhookUrl: string,
  payload: DiscordWebhookPayload,
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new DiscordWebhookError(
      `Discord webhook failed (${String(response.status)}): ${body}`,
      response.status,
      response.status === 429
        ? parseRetryAfter(response.headers.get('Retry-After'))
        : null,
    );
  }
}
