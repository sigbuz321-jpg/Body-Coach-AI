/**
 * Satu-satunya sumber path internal.
 *
 * Ada karena `app/(onboarding)/` adalah **route group**: tanda kurung membuat
 * segmen itu tidak muncul di URL. `app/(onboarding)/rencana/page.tsx` melayani
 * `/rencana`, bukan `/onboarding/rencana`. Menuliskan path secara literal di
 * `router.push` pernah membuat seluruh alur onboarding berakhir di 404 setelah
 * rencana berhasil disimpan — build tetap hijau karena Next tidak memvalidasi
 * argumen `router.push`.
 *
 * `routes.test.ts` mencocokkan setiap nilai di bawah dengan file `page.tsx`
 * yang benar-benar ada, jadi kesalahan yang sama tidak bisa lolos dua kali.
 */
export const ROUTES = {
  home: '/',
  onboarding: '/onboarding',
  rencana: '/rencana',
  sambungkan: '/sambungkan',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
