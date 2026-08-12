import { createMessageDeps, drainQueue, type Messenger } from '@bodycoach/worker';
import { computeSignature } from '@bodycoach/whatsapp';
import { z } from 'zod';

import { POST as webhookPost } from '../../webhooks/whatsapp/route';

/**
 * Simulator WhatsApp — HANYA untuk pengembangan.
 *
 * Approval Meta bisa makan berminggu-minggu, dan seluruh alur M5 harus bisa
 * dikembangkan dan dites tanpa nomor asli. Simulator ini **meniru bentuk
 * payload Meta, bukan API-nya**: yang dibangun adalah body webhook yang sama
 * persis bentuknya, ditandatangani dengan HMAC yang sama, lalu dikirim ke
 * handler webhook yang sama. Tidak ada jalur pintas — kalau verifikasi
 * signature, dedup, atau antrean rusak, simulator ikut gagal.
 *
 * Yang diganti hanya satu: `Messenger`. Balasan tidak dikirim ke Graph API
 * melainkan dikumpulkan dan dikembalikan di respons, supaya bisa dibaca
 * langsung dari `curl` tanpa nomor WhatsApp yang aktif.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z
  .object({
    /** Nomor E.164 tanpa '+'. */
    waId: z.string().min(6).max(20),
    text: z.string().max(4096).optional(),
    /** Id tombol, mis. `log:confirm:<uuid>`. */
    buttonId: z.string().max(200).optional(),
    /** Diisi sendiri untuk menguji replay: id yang sama harus terdedup. */
    messageId: z.string().min(1).max(200).optional(),
    /** Jalankan penguras antrean setelah enqueue. Default true. */
    drain: z.boolean().optional(),
  })
  .refine((b) => Boolean(b.text) || Boolean(b.buttonId), {
    message: 'isi salah satu: text atau buttonId',
  });

type SimOutbound =
  | { kind: 'text'; to: string; body: string }
  | { kind: 'interactive'; to: string; body: string; footer?: string; buttons: string[] };

function buildMetaPayload(input: {
  waId: string;
  messageId: string;
  text?: string;
  buttonId?: string;
}): unknown {
  const timestamp = String(Math.floor(Date.now() / 1000));

  const message = input.buttonId
    ? {
        id: input.messageId,
        from: input.waId,
        type: 'interactive',
        timestamp,
        interactive: {
          type: 'button_reply',
          button_reply: { id: input.buttonId, title: 'simulasi' },
        },
      }
    : {
        id: input.messageId,
        from: input.waId,
        type: 'text',
        timestamp,
        text: { body: input.text ?? '' },
      };

  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'simulator',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '0', phone_number_id: 'simulator' },
              contacts: [{ wa_id: input.waId, profile: { name: 'Simulator' } }],
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

export async function POST(req: Request): Promise<Response> {
  if (process.env.NODE_ENV === 'production') {
    // Endpoint ini menyuntik pesan atas nama nomor mana pun tanpa melewati
    // Meta. Di produksi itu berarti siapa pun bisa mencatat makanan ke akun
    // orang lain. Tidak ada mode "hati-hati" yang aman di sini.
    return new Response('not found', { status: 404 });
  }

  const appSecret = process.env['WA_APP_SECRET'] ?? '';
  if (!appSecret) {
    return Response.json(
      {
        error:
          'WA_APP_SECRET belum diisi di .env.local. Simulator menandatangani payloadnya ' +
          'sendiri, jadi nilainya boleh string bebas selama sama dengan yang dibaca webhook.',
      },
      { status: 503 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: 'body tidak valid', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const messageId =
    input.messageId ?? `wamid.sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const raw = JSON.stringify(
    buildMetaPayload({
      waId: input.waId,
      messageId,
      ...(input.text ? { text: input.text } : {}),
      ...(input.buttonId ? { buttonId: input.buttonId } : {}),
    }),
  );

  // Body dikirim sebagai string yang sama persis dengan yang ditandatangani.
  // Membiarkan `Request` menyusun ulang JSON-nya akan mengubah byte-nya dan
  // verifikasi gagal — jebakan yang sama dengan yang dihindari handler.
  const webhookRes = await webhookPost(
    new Request('http://localhost/api/webhooks/whatsapp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': computeSignature(raw, appSecret),
      },
      body: raw,
    }),
  );

  const enqueued = webhookRes.status === 200;
  const handlerMs = Number(webhookRes.headers.get('X-Handler-Ms') ?? '0');

  if (!enqueued || input.drain === false) {
    return Response.json({
      messageId,
      webhookStatus: webhookRes.status,
      handlerMs,
      drained: false,
      outbound: [],
    });
  }

  const outbound: SimOutbound[] = [];
  const messenger: Messenger = {
    async sendText(to, body) {
      outbound.push({ kind: 'text', to, body });
      return { messageId: `sim-out-${outbound.length}` };
    },
    async sendInteractive(msg) {
      outbound.push({
        kind: 'interactive',
        to: msg.to,
        body: msg.body,
        ...(msg.footer ? { footer: msg.footer } : {}),
        buttons: msg.buttons.map((b) => `${b.id} — ${b.title}`),
      });
      return { messageId: `sim-out-${outbound.length}` };
    },
  };

  const report = await drainQueue(createMessageDeps({ messenger }), { maxJobs: 5 });

  return Response.json({
    messageId,
    webhookStatus: webhookRes.status,
    handlerMs,
    drained: true,
    processed: report.processed,
    outcomes: report.outcomes,
    failed: report.failed,
    outbound,
  });
}
