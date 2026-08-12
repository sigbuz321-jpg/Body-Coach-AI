import type { OutboundButton, OutboundInteractive } from './types';

/**
 * Builder pesan interaktif.
 *
 * Batas Meta yang diam-diam menolak pesan kalau dilanggar:
 * - maksimal 3 tombol balasan
 * - judul tombol maksimal 20 karakter
 * - body maksimal 1024 karakter, footer maksimal 60
 *
 * Melanggarnya menghasilkan error 400 dari Graph API yang pesannya tidak
 * menyebut field mana yang salah, jadi pemotongan dilakukan di sini.
 */

export const MAX_BUTTONS = 3;
export const MAX_BUTTON_TITLE = 20;
export const MAX_BODY = 1024;
export const MAX_FOOTER = 60;

function clamp(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

export function buildInteractiveMessage(msg: OutboundInteractive): Record<string, unknown> {
  const buttons = msg.buttons.slice(0, MAX_BUTTONS).map((b: OutboundButton) => ({
    type: 'reply',
    reply: { id: b.id, title: clamp(b.title, MAX_BUTTON_TITLE) },
  }));

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: msg.to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: clamp(msg.body, MAX_BODY) },
      ...(msg.footer ? { footer: { text: clamp(msg.footer, MAX_FOOTER) } } : {}),
      action: { buttons },
    },
  };
}

export function buildTextMessage(to: string, body: string): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body: clamp(body, MAX_BODY * 4) },
  };
}

/**
 * Tombol standar setelah makanan dikenali. Id-nya membawa `logId` supaya
 * worker tahu baris mana yang dikonfirmasi tanpa menebak dari isi percakapan.
 */
export function foodConfirmButtons(logId: string): readonly OutboundButton[] {
  return [
    { id: `log:confirm:${logId}`, title: 'Catat' },
    { id: `log:portion:${logId}`, title: 'Ubah porsi' },
    { id: `log:cancel:${logId}`, title: 'Batal' },
  ];
}

export type ButtonAction =
  | { readonly kind: 'confirm'; readonly logId: string }
  | { readonly kind: 'portion'; readonly logId: string }
  | { readonly kind: 'cancel'; readonly logId: string }
  | { readonly kind: 'unknown'; readonly raw: string };

/** Kebalikan `foodConfirmButtons` — dipakai worker saat tombol ditekan. */
export function parseButtonId(raw: string): ButtonAction {
  const parts = raw.split(':');
  if (parts.length === 3 && parts[0] === 'log') {
    const logId = parts[2] ?? '';
    if (parts[1] === 'confirm') return { kind: 'confirm', logId };
    if (parts[1] === 'portion') return { kind: 'portion', logId };
    if (parts[1] === 'cancel') return { kind: 'cancel', logId };
  }
  return { kind: 'unknown', raw };
}
