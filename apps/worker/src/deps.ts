import { acquireUserLock, releaseUserLock, requeueMessage } from '@bodycoach/db';
import { createWhatsAppClient } from '@bodycoach/whatsapp';

import { createCoachRunnerIfConfigured } from './coach';
import type { LockManager, MessageDeps, Messenger } from './functions/message-received';
import { createStore } from './store';

/**
 * Perakitan dependensi nyata.
 *
 * Dipisah dari handler supaya handler bisa dites tanpa Postgres, Redis, Meta,
 * dan MiniMax hidup sekaligus — dan supaya satu-satunya tempat env dibaca ada
 * di sini, bukan tersebar di cabang-cabang keputusan.
 */

function env(name: string): string {
  return process.env[name] ?? '';
}

function createMessenger(): Messenger {
  const client = createWhatsAppClient({
    phoneNumberId: env('WA_PHONE_NUMBER_ID'),
    accessToken: env('WA_ACCESS_TOKEN'),
  });

  return {
    sendText: (to, body) => client.sendText(to, body),
    sendInteractive: (msg) =>
      client.sendInteractive({
        to: msg.to,
        body: msg.body,
        ...(msg.footer ? { footer: msg.footer } : {}),
        buttons: msg.buttons,
      }),
  };
}

/**
 * Token kunci dibuat acak per percobaan supaya pelepasan hanya menghapus kunci
 * milik sendiri. `crypto.randomUUID` tersedia di runtime Node 22 dan di edge —
 * `node:crypto` sengaja tidak diimpor supaya modul ini tetap bisa dipakai
 * route handler Next.
 */
function createLockManager(): LockManager {
  return {
    async acquire(keyHash) {
      const lock = await acquireUserLock(keyHash, crypto.randomUUID());
      if (!lock) return null;
      return { release: () => releaseUserLock(lock) };
    },
  };
}

export function createMessageDeps(overrides: Partial<MessageDeps> = {}): MessageDeps {
  return {
    store: createStore(),
    messenger: createMessenger(),
    coach: createCoachRunnerIfConfigured(),
    lock: createLockManager(),
    requeue: requeueMessage,
    now: () => new Date(),
    appUrl: env('APP_URL') || 'http://localhost:3000',
    ...overrides,
  };
}
