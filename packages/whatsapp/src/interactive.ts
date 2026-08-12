import type {
  OutboundButton,
  OutboundInteractive,
  OutboundList,
  OutboundListSection,
} from './types';

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

/**
 * Pesan daftar. Batas Meta yang berbeda dari tombol dan sama-sama ditolak
 * diam-diam: maksimal **10 baris total** di seluruh section, judul baris 24
 * karakter, deskripsi 72, teks tombol pembuka 20.
 */
export const MAX_LIST_ROWS = 10;
export const MAX_ROW_TITLE = 24;
export const MAX_ROW_DESC = 72;
export const MAX_LIST_BUTTON = 20;

export function buildListMessage(msg: OutboundList): Record<string, unknown> {
  // Pemotongan dilakukan lintas section, bukan per section: batas 10 itu
  // berlaku untuk keseluruhan, dan Graph API menolak seluruh pesan kalau
  // dilanggar tanpa menyebut section mana yang salah.
  let sisa = MAX_LIST_ROWS;
  const sections: Record<string, unknown>[] = [];
  for (const s of msg.sections) {
    if (sisa <= 0) break;
    const rows = s.rows.slice(0, sisa).map((r) => ({
      id: r.id,
      title: clamp(r.title, MAX_ROW_TITLE),
      ...(r.description ? { description: clamp(r.description, MAX_ROW_DESC) } : {}),
    }));
    if (rows.length === 0) continue;
    sisa -= rows.length;
    sections.push({ title: clamp(s.title, MAX_ROW_TITLE), rows });
  }

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: msg.to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: clamp(msg.body, MAX_BODY) },
      ...(msg.footer ? { footer: { text: clamp(msg.footer, MAX_FOOTER) } } : {}),
      action: { button: clamp(msg.buttonText, MAX_LIST_BUTTON), sections },
    },
  };
}

/**
 * Baris koreksi untuk satu item log (M6).
 *
 * Dua jenis dalam satu daftar, karena keduanya adalah "yang tadi salah":
 * makanannya keliru, atau porsinya keliru. Memisahkannya ke dua pesan berarti
 * pengguna harus menebak dulu mana yang mau diperbaiki sebelum melihat
 * pilihannya.
 */
export function foodCorrectionSections(
  itemId: string,
  kandidat: readonly {
    readonly foodItemId: string;
    readonly label: string;
    /** Opsional: dihitung hanya kalau pemanggil memang sudah punya angkanya. */
    readonly kcal?: number;
  }[],
): OutboundListSection[] {
  const sections: OutboundListSection[] = [];

  if (kandidat.length > 0) {
    sections.push({
      title: 'Ganti makanan',
      rows: kandidat.map((c) => ({
        id: `fix:food:${itemId}:${c.foodItemId}`,
        title: c.label,
        ...(c.kcal === undefined ? {} : { description: `±${c.kcal} kkal per porsi` }),
      })),
    });
  }

  sections.push({
    title: 'Ubah porsi',
    rows: [
      { id: `fix:porsi:${itemId}:0.5`, title: 'Setengah porsi' },
      { id: `fix:porsi:${itemId}:1`, title: 'Satu porsi penuh' },
      { id: `fix:porsi:${itemId}:2`, title: 'Dua porsi' },
    ],
  });

  return sections;
}

export type ButtonAction =
  | { readonly kind: 'confirm'; readonly logId: string }
  | { readonly kind: 'portion'; readonly logId: string }
  | { readonly kind: 'cancel'; readonly logId: string }
  | { readonly kind: 'fix_food'; readonly itemId: string; readonly foodItemId: string }
  | { readonly kind: 'fix_portion'; readonly itemId: string; readonly multiplier: number }
  | { readonly kind: 'unknown'; readonly raw: string };

/** Kebalikan `foodConfirmButtons` dan `foodCorrectionSections`. */
export function parseButtonId(raw: string): ButtonAction {
  const parts = raw.split(':');

  if (parts.length === 3 && parts[0] === 'log') {
    const logId = parts[2] ?? '';
    if (parts[1] === 'confirm') return { kind: 'confirm', logId };
    if (parts[1] === 'portion') return { kind: 'portion', logId };
    if (parts[1] === 'cancel') return { kind: 'cancel', logId };
  }

  if (parts.length === 4 && parts[0] === 'fix') {
    const itemId = parts[2] ?? '';
    if (parts[1] === 'food' && parts[3]) {
      return { kind: 'fix_food', itemId, foodItemId: parts[3] };
    }
    if (parts[1] === 'porsi') {
      const multiplier = Number(parts[3]);
      // Nilai dari luar; yang tidak masuk akal ditolak, bukan dipakai.
      if (Number.isFinite(multiplier) && multiplier > 0 && multiplier <= 4) {
        return { kind: 'fix_portion', itemId, multiplier };
      }
    }
  }

  return { kind: 'unknown', raw };
}
