import { createHash } from 'node:crypto';

import { buildInteractiveMessage, buildListMessage, buildTextMessage } from './interactive';
import type { OutboundInteractive, OutboundList } from './types';

/**
 * Klien Meta WhatsApp Cloud API (Graph).
 *
 * JANGAN PERNAH mengganti ini dengan Baileys atau whatsapp-web.js — keduanya
 * tidak resmi, melanggar ToS WhatsApp, dan berujung nomor diblokir.
 *
 * Semua nomor di-hash sebelum masuk log (konvensi CLAUDE.md), dan isi pesan
 * tidak pernah ikut ke error tracker.
 */

const GRAPH_VERSION = 'v21.0';

export interface WhatsAppClientOptions {
  readonly phoneNumberId: string;
  readonly accessToken: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export class WhatsAppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'WhatsAppError';
  }
}

/** Hash nomor untuk log. Tidak reversibel, tapi stabil untuk korelasi. */
export function hashWaId(waId: string): string {
  return createHash('sha256').update(waId).digest('hex').slice(0, 12);
}

export interface SendResult {
  readonly messageId: string;
}

export interface WhatsAppClient {
  sendText(to: string, body: string): Promise<SendResult>;
  sendInteractive(msg: OutboundInteractive): Promise<SendResult>;
  /** Pesan daftar — dipakai koreksi satu ketukan (M6). */
  sendList(msg: OutboundList): Promise<SendResult>;
  /** URL media sementara dari Meta; harus diunduh dengan token yang sama. */
  getMediaUrl(mediaId: string): Promise<string>;
  downloadMedia(url: string): Promise<{ data: ArrayBuffer; contentType: string }>;
}

export function createWhatsAppClient(opts: WhatsAppClientOptions): WhatsAppClient {
  const {
    phoneNumberId,
    accessToken,
    baseUrl = `https://graph.facebook.com/${GRAPH_VERSION}`,
    timeoutMs = 15_000,
    fetchImpl = globalThis.fetch,
  } = opts;

  async function call(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers ?? {}) },
        signal: controller.signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'gagal menghubungi Graph API';
      throw new WhatsAppError(msg, 0, true);
    } finally {
      clearTimeout(timer);
    }
  }

  async function postMessage(payload: Record<string, unknown>): Promise<SendResult> {
    const res = await call(`/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      // Isi pesan tidak pernah ikut ke error: body-nya milik pengguna.
      throw new WhatsAppError(
        `Graph API ${res.status}: ${text.slice(0, 300)}`,
        res.status,
        res.status === 429 || res.status >= 500,
      );
    }
    const body = JSON.parse(text) as { messages?: { id?: string }[] };
    return { messageId: body.messages?.[0]?.id ?? '' };
  }

  return {
    sendText(to, body) {
      return postMessage(buildTextMessage(to, body));
    },

    sendInteractive(msg) {
      return postMessage(buildInteractiveMessage(msg));
    },

    sendList(msg) {
      return postMessage(buildListMessage(msg));
    },

    async getMediaUrl(mediaId) {
      const res = await call(`/${mediaId}`, { method: 'GET' });
      if (!res.ok) {
        throw new WhatsAppError(
          `gagal mengambil URL media: ${res.status}`,
          res.status,
          res.status >= 500,
        );
      }
      const body = (await res.json()) as { url?: string };
      if (!body.url) throw new WhatsAppError('respons media tanpa url', 502, true);
      return body.url;
    },

    async downloadMedia(url) {
      // URL media Meta tetap butuh Authorization; tanpa itu balasannya 401.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new WhatsAppError(
            `gagal mengunduh media: ${res.status}`,
            res.status,
            res.status >= 500,
          );
        }
        return {
          data: await res.arrayBuffer(),
          contentType: res.headers.get('content-type') ?? 'application/octet-stream',
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
