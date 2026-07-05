import {
  DiscordWebhookError,
  sendToDiscord,
  type DiscordWebhookPayload,
} from './discord.js';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
const MIN_INTERVAL_MS = 2000;

type QueueItem = {
  webhookUrl: string;
  payload: DiscordWebhookPayload;
  resolve: () => void;
  reject: (error: Error) => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DiscordWebhookQueue {
  private queue: QueueItem[] = [];
  private pumping = false;
  private inFlight = 0;
  private lastSentAt = 0;

  enqueue(webhookUrl: string, payload: DiscordWebhookPayload): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ webhookUrl, payload, resolve, reject });
      void this.pump();
    });
  }

  get pendingCount(): number {
    return this.queue.length + this.inFlight;
  }

  async drain(): Promise<void> {
    while (this.pendingCount > 0) {
      await sleep(100);
    }
  }

  private async pump(): Promise<void> {
    if (this.pumping) {
      return;
    }

    this.pumping = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) {
        break;
      }

      const waitMs = this.lastSentAt + MIN_INTERVAL_MS - Date.now();
      if (waitMs > 0) {
        await sleep(waitMs);
      }

      this.inFlight++;
      try {
        await this.sendWithRetry(item.webhookUrl, item.payload);
        this.lastSentAt = Date.now();
        item.resolve();
      } catch (error) {
        item.reject(error instanceof Error ? error : new Error(String(error)));
      } finally {
        this.inFlight--;
      }
    }

    this.pumping = false;
  }

  private async sendWithRetry(
    webhookUrl: string,
    payload: DiscordWebhookPayload,
    attempt = 0,
  ): Promise<void> {
    try {
      await sendToDiscord(webhookUrl, payload);
    } catch (error) {
      if (attempt >= MAX_RETRIES) {
        throw error;
      }

      const retryAfterMs =
        error instanceof DiscordWebhookError ? error.retryAfterMs : null;
      const delayMs =
        retryAfterMs ?? Math.min(BASE_DELAY_MS * 2 ** attempt, 60_000);
      await sleep(delayMs);
      await this.sendWithRetry(webhookUrl, payload, attempt + 1);
    }
  }
}
