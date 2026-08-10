'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Hook untuk state wizard onboarding yang persisten di sessionStorage.
 *
 * - Beban awal: hidrasi dari storage jika ada, kalau tidak dari initial.
 * - Setiap perubahan disimpan otomatis.
 * - `reset` dipakai pada submit berhasil agar alur berikutnya dimulai bersih.
 *
 * TypeScript generic: T harus JSON-serializable. Dipakai dengan tipe datar
 * (string, number, boolean, readonly array) — objek bersarang tidak stabil
 * di sessionStorage.
 */

export interface SessionStateHook<T> {
  readonly value: T;
  readonly set: (updater: T | ((prev: T) => T)) => void;
  readonly reset: () => void;
  /** True sampai hidrasi pertama selesai — penting untuk render SSR. */
  readonly hydrated: boolean;
}

export function useSessionState<T extends object>(key: string, initial: T): SessionStateHook<T> {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as T;
        setValue(parsed);
      }
    } catch {
      // Storage korup / tidak tersedia — abaikan, pakai initial.
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Kuota penuh / mode privat — abaikan, state in-memory masih bekerja.
    }
  }, [key, value, hydrated]);

  const set = useCallback((updater: T | ((prev: T) => T)) => {
    setValue((prev) => (typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater));
  }, []);

  const reset = useCallback(() => {
    setValue(initial);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(key);
      } catch {
        // Abaikan.
      }
    }
  }, [initial, key]);

  return { value, set, reset, hydrated };
}
