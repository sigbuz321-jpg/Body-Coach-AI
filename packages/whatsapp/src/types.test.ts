import { describe, expect, it } from 'vitest';

import { buildTemplateMessage, TEMPLATES } from './templates';
import { extractMessages } from './types';
import { buildInteractiveMessage, foodConfirmButtons, parseButtonId } from './interactive';

function payload(messages: unknown[], extra: Record<string, unknown> = {}) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: { messages, ...extra } }] }],
  };
}

describe('extractMessages', () => {
  it('mengambil pesan teks', () => {
    const out = extractMessages(
      payload([
        {
          id: 'wamid.1',
          from: '628123',
          type: 'text',
          timestamp: '1754900000',
          text: { body: 'halo' },
        },
      ]),
    );
    expect(out).toEqual([
      { id: 'wamid.1', from: '628123', type: 'text', timestamp: 1754900000, text: 'halo' },
    ]);
  });

  it('mengambil mediaId dari pesan gambar', () => {
    const out = extractMessages(
      payload([{ id: 'wamid.2', from: '628123', type: 'image', image: { id: 'media-9' } }]),
    );
    expect(out[0]?.mediaId).toBe('media-9');
    expect(out[0]?.type).toBe('image');
  });

  it('mengambil id tombol dari pesan interaktif', () => {
    const out = extractMessages(
      payload([
        {
          id: 'wamid.3',
          from: '628123',
          type: 'interactive',
          interactive: { type: 'button_reply', button_reply: { id: 'log:confirm:abc' } },
        },
      ]),
    );
    expect(out[0]?.buttonId).toBe('log:confirm:abc');
  });

  it('mengabaikan notifikasi status — jumlahnya jauh lebih banyak dari pesan nyata', () => {
    const out = extractMessages(
      payload([], { statuses: [{ id: 'wamid.x', status: 'delivered' }] }),
    );
    expect(out).toEqual([]);
  });

  it('membuang pesan tanpa id atau tanpa pengirim', () => {
    const out = extractMessages(
      payload([
        { from: '628123', type: 'text' },
        { id: 'wamid.4', type: 'text' },
      ]),
    );
    expect(out).toEqual([]);
  });

  it('menandai tipe tak dikenal sebagai unsupported, bukan melempar', () => {
    const out = extractMessages(payload([{ id: 'w.5', from: '628', type: 'sticker' }]));
    expect(out[0]?.type).toBe('unsupported');
  });

  it('tidak melempar untuk payload kosong atau asing', () => {
    expect(extractMessages({})).toEqual([]);
    expect(extractMessages(null)).toEqual([]);
    expect(extractMessages({ entry: [{}] })).toEqual([]);
  });
});

describe('interactive', () => {
  it('memotong judul tombol yang melewati batas 20 karakter Meta', () => {
    const msg = buildInteractiveMessage({
      to: '628123',
      body: 'oke?',
      buttons: [{ id: 'a', title: 'Judul yang panjang sekali melebihi batas' }],
    });
    const action = (msg['interactive'] as { action: { buttons: { reply: { title: string } }[] } })
      .action;
    expect(action.buttons[0]?.reply.title.length).toBeLessThanOrEqual(20);
  });

  it('membatasi jumlah tombol menjadi tiga', () => {
    const msg = buildInteractiveMessage({
      to: '628123',
      body: 'x',
      buttons: [
        { id: '1', title: 'a' },
        { id: '2', title: 'b' },
        { id: '3', title: 'c' },
        { id: '4', title: 'd' },
      ],
    });
    const action = (msg['interactive'] as { action: { buttons: unknown[] } }).action;
    expect(action.buttons).toHaveLength(3);
  });

  it('parseButtonId adalah kebalikan foodConfirmButtons', () => {
    const buttons = foodConfirmButtons('log-42');
    expect(buttons.map((b) => parseButtonId(b.id))).toEqual([
      { kind: 'confirm', logId: 'log-42' },
      { kind: 'portion', logId: 'log-42' },
      { kind: 'cancel', logId: 'log-42' },
    ]);
  });

  it('id tombol asing tidak melempar', () => {
    expect(parseButtonId('sesuatu-yang-lain')).toEqual({
      kind: 'unknown',
      raw: 'sesuatu-yang-lain',
    });
  });
});

describe('templates', () => {
  it('keempat template terdaftar dan berkategori UTILITY', () => {
    const names = Object.keys(TEMPLATES);
    expect(names).toHaveLength(4);
    for (const def of Object.values(TEMPLATES)) {
      expect(def.category).toBe('UTILITY');
      expect(def.language).toBe('id');
    }
  });

  it('jumlah placeholder di body cocok dengan jumlah params', () => {
    for (const def of Object.values(TEMPLATES)) {
      const placeholders = new Set(def.body.match(/\{\{\d+\}\}/g) ?? []);
      expect(placeholders.size).toBe(def.params.length);
    }
  });

  it('menolak jumlah parameter yang salah sebelum request terkirim', () => {
    expect(() => buildTemplateMessage('628', 'pengingat_timbang', [])).toThrow(/butuh 1 parameter/);
  });

  it('membangun payload template Graph API', () => {
    const msg = buildTemplateMessage('628123', 'pengingat_timbang', ['4']);
    expect(msg['type']).toBe('template');
    const tpl = msg['template'] as { name: string; components: { parameters: unknown[] }[] };
    expect(tpl.name).toBe('pengingat_timbang');
    expect(tpl.components[0]?.parameters).toEqual([{ type: 'text', text: '4' }]);
  });
});
