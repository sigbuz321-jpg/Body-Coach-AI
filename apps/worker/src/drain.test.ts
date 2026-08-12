import type { MessageJob } from '@bodycoach/db';
import { dequeueMessage } from '@bodycoach/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { drainQueue } from './drain';
import type * as MessageReceived from './functions/message-received';
import type { MessageDeps, MessageOutcome } from './functions/message-received';

/**
 * `@bodycoach/db` di-mock seluruhnya: yang diuji di sini adalah bentuk loop
 * penguras, bukan Redis. `parsePairingMessage` ikut disediakan karena handler
 * mengimpornya dari modul yang sama.
 */
vi.mock('@bodycoach/db', () => ({
  dequeueMessage: vi.fn(),
  parsePairingMessage: () => null,
}));

const dequeue = vi.mocked(dequeueMessage);

function job(id: string): MessageJob {
  return { waId: '628123456789', messageId: id, type: 'text', body: 'nasi', ts: 1 };
}

/** Antrean palsu: satu larik yang dipop dari depan. */
function antrean(jobs: readonly MessageJob[]): void {
  const sisa = [...jobs];
  dequeue.mockImplementation(async () => sisa.shift() ?? null);
}

function deps(over: Partial<MessageDeps> = {}): MessageDeps {
  return {
    store: {} as MessageDeps['store'],
    messenger: {} as MessageDeps['messenger'],
    coach: null,
    lock: { acquire: async () => ({ release: async () => {} }) },
    requeue: async () => {},
    now: () => new Date('2026-08-12T12:15:00Z'),
    appUrl: 'https://contoh.id',
    ...over,
  };
}

/**
 * Handler diganti lewat modul: `drainQueue` memanggilnya langsung, bukan lewat
 * dependensi, karena handler-lah unit yang diuji terpisah di file sebelah.
 */
vi.mock('./functions/message-received', async () => {
  const actual = await vi.importActual<typeof MessageReceived>('./functions/message-received');
  return { ...actual, handleMessageReceived: vi.fn() };
});

const { handleMessageReceived } = await import('./functions/message-received');
const handle = vi.mocked(handleMessageReceived);

const OK: MessageOutcome = { kind: 'no_food' };

beforeEach(() => {
  vi.clearAllMocks();
  handle.mockResolvedValue(OK);
});

describe('drainQueue', () => {
  it('berhenti saat antrean kosong', async () => {
    antrean([job('a'), job('b')]);

    const laporan = await drainQueue(deps());

    expect(laporan.processed).toBe(2);
    expect(laporan.failed).toBe(0);
    // Sekali lagi untuk memastikan `null` yang menghentikannya, bukan batas.
    expect(dequeue).toHaveBeenCalledTimes(3);
  });

  it('tidak pernah melewati maxJobs walau antreannya tak habis-habis', async () => {
    dequeue.mockImplementation(async () => job('lagi'));

    const laporan = await drainQueue(deps(), { maxJobs: 3 });

    expect(laporan.processed).toBe(3);
  });

  it('menghitung job yang ditunda', async () => {
    antrean([job('a'), job('b')]);
    handle.mockResolvedValueOnce({ kind: 'deferred' }).mockResolvedValueOnce(OK);

    const laporan = await drainQueue(deps());

    expect(laporan.deferred).toBe(1);
    expect(laporan.processed).toBe(2);
  });

  it('satu job gagal tidak menghentikan sisanya', async () => {
    antrean([job('a'), job('b'), job('c')]);
    handle
      .mockRejectedValueOnce(new Error('meledak'))
      .mockResolvedValueOnce(OK)
      .mockResolvedValueOnce(OK);

    const laporan = await drainQueue(deps());

    expect(laporan.failed).toBe(1);
    expect(laporan.processed).toBe(2);
    expect(handle).toHaveBeenCalledTimes(3);
  });
});
