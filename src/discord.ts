import { acct, entities } from 'misskey-js';

const DISCORD_EMBED_LIMIT = 10;
const DISCORD_FETCH_TIMEOUT_MS = 30_000;
const DISCORD_USERNAME_LIMIT = 80;
const DISCORD_EMBED_TITLE_LIMIT = 256;
const DISCORD_EMBED_DESCRIPTION_LIMIT = 4096;
const DISCORD_EMBED_TOTAL_CHARS = 6000;
const NOTE_EMBED_COLOR = 0x86b300;

type DiscordEmbed = {
  title?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: { text: string; icon_url?: string };
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

export function isRetryableDiscordError(error: DiscordWebhookError): boolean {
  return error.status === 429 || error.status >= 500;
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

function truncatePlain(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  const ellipsis = '…';
  return text.slice(0, maxLength - ellipsis.length) + ellipsis;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  const ellipsis = '…';
  const closeSpoiler = '||';
  let sliceEnd = maxLength - ellipsis.length;
  let truncated = text.slice(0, sliceEnd);
  const spoilerCount = (truncated.match(/\|\|/g) ?? []).length;

  if (spoilerCount % 2 !== 0) {
    sliceEnd = maxLength - closeSpoiler.length - ellipsis.length;
    truncated = text.slice(0, sliceEnd) + closeSpoiler;
  }

  return truncated + ellipsis;
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

function formatReplyLink(note: entities.Note, origin: string): string | null {
  const replyId = note.replyId ?? note.reply?.id;
  if (!replyId) {
    return null;
  }

  return `**Reply to:** ${origin}/notes/${replyId}`;
}

function formatPoll(poll: NonNullable<entities.Note['poll']>): string {
  const lines = ['**Poll:**'];

  if (poll.multiple) {
    lines.push('(multiple choice)');
  }

  poll.choices.forEach((choice, index) => {
    const label = typeof choice === 'string' ? choice : choice.text;
    const votes =
      typeof choice === 'string' || choice.votes === undefined
        ? ''
        : ` (${String(choice.votes)} votes)`;
    lines.push(`${String(index + 1)}. ${label}${votes}`);
  });

  if (poll.expiresAt) {
    lines.push(`Expires: ${poll.expiresAt}`);
  }

  return lines.join('\n');
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
  noteUrl: string,
  mainImage: { url: string | null },
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

    if (file.type.startsWith('image/') && !mainImage.url) {
      mainImage.url = fileUrl;
      continue;
    }

    if (embeds.length >= DISCORD_EMBED_LIMIT - 1) {
      overflowLines.push(`[${file.name}](${fileUrl})`);
      continue;
    }

    if (file.type.startsWith('image/')) {
      // Sharing the note URL groups these into one gallery alongside the main embed.
      embeds.push({ url: noteUrl, image: { url: fileUrl } });
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
  noteUrl: string,
): {
  mainImageUrl: string | null;
  embeds: DiscordEmbed[];
  sensitiveLines: string[];
  overflowLines: string[];
} {
  const embeds: DiscordEmbed[] = [];
  const sensitiveLines: string[] = [];
  const overflowLines: string[] = [];
  const mainImage: { url: string | null } = { url: null };

  appendFileContent(
    embeds,
    sensitiveLines,
    overflowLines,
    note.files,
    origin,
    noteUrl,
    mainImage,
  );
  if (note.renote) {
    appendFileContent(
      embeds,
      sensitiveLines,
      overflowLines,
      note.renote.files,
      origin,
      noteUrl,
      mainImage,
    );
  }

  return { mainImageUrl: mainImage.url, embeds, sensitiveLines, overflowLines };
}

function embedCharCount(embed: DiscordEmbed): number {
  let count = 0;
  if (embed.title) {
    count += embed.title.length;
  }
  if (embed.description) {
    count += embed.description.length;
  }
  if (embed.url) {
    count += embed.url.length;
  }
  if (embed.image?.url) {
    count += embed.image.url.length;
  }
  if (embed.footer?.text) {
    count += embed.footer.text.length;
  }
  return count;
}

function embedToLink(embed: DiscordEmbed): string | null {
  const url = embed.image?.url ?? embed.url;
  if (!url) {
    return null;
  }

  const label = embed.title ? truncatePlain(embed.title, 100) : 'Image';
  return `[${label}](${url})`;
}

function enforceEmbedLimits(
  embeds: DiscordEmbed[],
  overflowLines: string[],
  totalCharBudget: number = DISCORD_EMBED_TOTAL_CHARS,
): DiscordEmbed[] {
  const limited = embeds.map((embed) => ({
    ...embed,
    title: embed.title
      ? truncatePlain(embed.title, DISCORD_EMBED_TITLE_LIMIT)
      : undefined,
  }));

  let totalChars = limited.reduce(
    (sum, embed) => sum + embedCharCount(embed),
    0,
  );
  while (totalChars > totalCharBudget && limited.length > 0) {
    const removed = limited.pop();
    if (!removed) {
      break;
    }

    const link = embedToLink(removed);
    if (link) {
      overflowLines.push(link);
    }

    totalChars = limited.reduce((sum, embed) => sum + embedCharCount(embed), 0);
  }

  return limited;
}

export function buildDiscordPayload(
  note: entities.Note,
  origin: string,
  options: { includeAttachments?: boolean } = {},
): DiscordWebhookPayload {
  const includeAttachments = options.includeAttachments ?? true;
  const noteUrl = `${origin}/notes/${note.id}`;
  const authorName = note.user.name || note.user.username;
  const lines: string[] = [];

  const replyLink = formatReplyLink(note, origin);
  if (replyLink) {
    lines.push(replyLink);
    lines.push('');
  }

  if (note.cw) {
    lines.push(`**CW: ${note.cw}**`);
    lines.push('');
  }

  if (note.text) {
    lines.push(note.cw ? wrapSpoiler(note.text) : note.text);
  }

  if (note.poll) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(formatPoll(note.poll));
  }

  if (note.renote) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(formatQuotedNote(note.renote, origin));
  }

  const {
    mainImageUrl,
    embeds: rawEmbeds,
    sensitiveLines,
    overflowLines,
  } = includeAttachments
    ? collectMedia(note, origin, noteUrl)
    : { mainImageUrl: null, embeds: [], sensitiveLines: [], overflowLines: [] };

  // Reserve worst-case room for the main embed's own fields so the combined
  // embeds array never exceeds Discord's 6000-char total budget.
  const extraEmbedBudget = Math.max(
    0,
    DISCORD_EMBED_TOTAL_CHARS -
      DISCORD_EMBED_DESCRIPTION_LIMIT -
      DISCORD_EMBED_TITLE_LIMIT -
      noteUrl.length,
  );
  const extraEmbeds = enforceEmbedLimits(
    rawEmbeds,
    overflowLines,
    extraEmbedBudget,
  );

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

  const description = truncate(
    lines.join('\n').trim(),
    DISCORD_EMBED_DESCRIPTION_LIMIT,
  );

  const mainEmbed: DiscordEmbed = {
    title: truncatePlain(
      `${authorName} (@${formatUserName(note.user)})`,
      DISCORD_EMBED_TITLE_LIMIT,
    ),
    url: noteUrl,
    description: description || undefined,
    timestamp: note.createdAt,
    color: NOTE_EMBED_COLOR,
    footer: { text: new URL(origin).hostname },
    image: mainImageUrl ? { url: mainImageUrl } : undefined,
  };

  return {
    username: truncatePlain(authorName, DISCORD_USERNAME_LIMIT),
    avatar_url: toAbsoluteUrl(note.user.avatarUrl, origin),
    embeds: [mainEmbed, ...extraEmbeds],
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
    signal: AbortSignal.timeout(DISCORD_FETCH_TIMEOUT_MS),
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
