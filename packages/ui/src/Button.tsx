import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Tombol dengan varian desain "Piring & Plat".
 *
 * - `primary`  : fill `--iron-900`, teks putih, pill, tinggi 52px. Satu per layar.
 * - `secondary`: transparan, border 2px, pill, tinggi 52px.
 * - `ghost`    : teks saja, tinggi 48px.
 * - `destructive`: teks merah, tanpa border.
 *
 * State `disabled` mengikuti konvensi `--enamel-200` / `--enamel-400` agar
 * tidak menarik perhatian; state `loading` mempertahankan label agar lebar
 * tidak berubah (anti layout shift).
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly loading?: boolean;
  readonly children: ReactNode;
}

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      data-variant={variant}
      className={`bc-button bc-button--${variant}${isDisabled ? ' bc-button--disabled' : ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}
