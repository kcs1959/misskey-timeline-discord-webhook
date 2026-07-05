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

function formatQuotedNote(note: entities.Note, origin: string): string {
  const user = formatUserName(note.user);
  const lines = [`> **${user}**`];

  if (note.cw) {
    lines.push(`> CW: ${note.cw}`);
  }
  if (note.text) {
    for (const line of note.text.split('\n')) {
      lines.push(`> ${line}`);
    }
  }
  if (!note.text && !note.cw) {
    lines.push('> (内容なし)');
  }

  lines.push(`> ${origin}/notes/${note.id}`);
  return lines.join('\n');
}

function collectEmbeds(note: entities.Note, origin: string): DiscordEmbed[] {
  const embeds: DiscordEmbed[] = [];

  for (const file of note.files ?? []) {
    if (embeds.length >= DISCORD_EMBED_LIMIT) {
      break;
    }
    const fileUrl = toAbsoluteUrl(file.url, origin);
    if (!fileUrl) {
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

  return embeds;
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
    lines.push(note.text);
  }

  if (note.renote) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(formatQuotedNote(note.renote, origin));
  }

  lines.push('');
  lines.push(`${origin}/notes/${note.id}`);

  const content = truncate(lines.join('\n').trim(), DISCORD_CONTENT_LIMIT);
  const embeds = collectEmbeds(note, origin);

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
    throw new Error(
      `Discord webhook failed (${String(response.status)}): ${body}`,
    );
  }
}
