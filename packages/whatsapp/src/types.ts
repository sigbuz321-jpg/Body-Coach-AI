/**
 * Bentuk payload webhook Meta WhatsApp Cloud API.
 *
 * Sengaja longgar (`?` di mana-mana): Meta menambah field tanpa versi baru,
 * dan handler webhook tidak boleh gagal karena ada kunci tak dikenal. Yang
 * ketat justru `extractMessages`, yang hanya meloloskan pesan lengkap.
 */

export type IncomingMessageType = 'text' | 'image' | 'interactive' | 'audio' | 'unsupported';

export interface IncomingMessage {
  /** `wamid...` — unik per pesan, dipakai untuk dedup (AD-2). */
  readonly id: string;
  /** Nomor pengirim E.164 tanpa '+'. */
  readonly from: string;
  readonly type: IncomingMessageType;
  readonly timestamp: number;
  readonly text?: string;
  /** Id media untuk foto makanan; diunduh worker, tidak di handler. */
  readonly mediaId?: string;
  /** Id tombol interaktif yang ditekan, mis. `log:confirm:<logId>`. */
  readonly buttonId?: string;
}

interface RawMessage {
  id?: string;
  from?: string;
  type?: string;
  timestamp?: string;
  text?: { body?: string };
  image?: { id?: string };
  audio?: { id?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string };
    list_reply?: { id?: string };
  };
}

interface RawPayload {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        messages?: RawMessage[];
        statuses?: unknown[];
      };
    }[];
  }[];
}

function toType(raw: string | undefined): IncomingMessageType {
  switch (raw) {
    case 'text':
    case 'image':
    case 'interactive':
    case 'audio':
      return raw;
    default:
      return 'unsupported';
  }
}

/**
 * Mengambil pesan masuk dari payload webhook.
 *
 * Notifikasi status (`sent`, `delivered`, `read`) diabaikan — jumlahnya jauh
 * lebih banyak daripada pesan nyata, dan memasukkannya ke antrean berarti
 * membayar worker untuk tidak melakukan apa-apa.
 */
export function extractMessages(payload: unknown): IncomingMessage[] {
  const p = payload as RawPayload;
  const out: IncomingMessage[] = [];

  for (const entry of p?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) {
        if (!m.id || !m.from) continue;
        const type = toType(m.type);
        const text = m.text?.body;
        const mediaId = m.image?.id ?? m.audio?.id;
        const buttonId = m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id;

        out.push({
          id: m.id,
          from: m.from,
          type,
          timestamp: Number(m.timestamp ?? 0),
          ...(text ? { text } : {}),
          ...(mediaId ? { mediaId } : {}),
          ...(buttonId ? { buttonId } : {}),
        });
      }
    }
  }
  return out;
}

/** Nomor WhatsApp yang di-hash untuk log (konvensi CLAUDE.md). */
export interface OutboundText {
  readonly to: string;
  readonly body: string;
}

export interface OutboundButton {
  /** Maks 20 karakter — batas Meta, dipotong oleh builder. */
  readonly id: string;
  readonly title: string;
}

export interface OutboundInteractive {
  readonly to: string;
  readonly body: string;
  readonly buttons: readonly OutboundButton[];
  readonly footer?: string;
}

/**
 * Baris dalam pesan daftar. Dipakai koreksi satu ketukan (M6): tiga tombol
 * tidak cukup untuk menawarkan beberapa kandidat makanan sekaligus beberapa
 * pilihan porsi.
 */
export interface OutboundListRow {
  /** Maks 200 karakter. */
  readonly id: string;
  /** Maks 24 karakter — batas Meta, dipotong builder. */
  readonly title: string;
  /** Maks 72 karakter. Dipakai menampilkan kalori kandidat. */
  readonly description?: string;
}

export interface OutboundListSection {
  /** Maks 24 karakter. */
  readonly title: string;
  readonly rows: readonly OutboundListRow[];
}

export interface OutboundList {
  readonly to: string;
  readonly body: string;
  /** Teks tombol yang membuka daftarnya. Maks 20 karakter. */
  readonly buttonText: string;
  readonly sections: readonly OutboundListSection[];
  readonly footer?: string;
}
