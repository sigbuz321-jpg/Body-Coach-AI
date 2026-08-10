import type { ChangeEvent } from 'react';

export interface SliderProps {
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly ariaLabel: string;
  /** Apakah value mengandung desimal (true) atau bulat (false). */
  readonly decimal?: boolean;
}

/**
 * Slider angka besar, dipakai untuk tinggi dan berat.
 *
 * Tetaplah <input type="range"> native: mendukung keyboard arrow,
 * trackpad, dan screen reader tanpa usaha tambahan. Visual disetel lewat
 * class CSS yang meng-override thumb bawaan.
 */
export function Slider({
  min,
  max,
  step = 1,
  value,
  onChange,
  ariaLabel,
  decimal = false,
}: SliderProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const parsed = decimal ? parseFloat(raw) : parseInt(raw, 10);
    if (!Number.isNaN(parsed)) onChange(parsed);
  }
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={handleChange}
      aria-label={ariaLabel}
      className="bc-slider"
    />
  );
}
