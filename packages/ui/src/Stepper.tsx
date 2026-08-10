export interface StepperProps {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly unit: string;
  readonly ariaLabel: string;
  readonly onChange: (value: number) => void;
  /** Tampilkan sebagai desimal (true) atau bulat (false). */
  readonly decimal?: boolean;
}

/**
 * Stepper angka besar (tombol + / −), dipakai untuk umur.
 *
 * Tombol lingkaran 64×64 px. Nilai tampil dengan font mono tabular.
 */
export function Stepper({
  value,
  min,
  max,
  unit,
  ariaLabel,
  onChange,
  decimal = false,
}: StepperProps) {
  const atMin = value <= min;
  const atMax = value >= max;
  function dec() {
    if (!atMin) onChange(decimal ? Number((value - 0.1).toFixed(1)) : value - 1);
  }
  function inc() {
    if (!atMax) onChange(decimal ? Number((value + 0.1).toFixed(1)) : value + 1);
  }
  const display = decimal ? value.toFixed(1).replace('.', ',') : String(value);
  return (
    <div className="bc-stepper" role="group" aria-label={ariaLabel}>
      <div className="bc-stepper__value">
        <span className="bc-num bc-stepper__number">{display}</span>
        <span className="bc-stepper__unit">{unit}</span>
      </div>
      <div className="bc-stepper__btns">
        <button
          type="button"
          className="bc-stepper__btn"
          aria-label={`Kurangi ${ariaLabel.toLowerCase()}`}
          onClick={dec}
          disabled={atMin}
        >
          −
        </button>
        <button
          type="button"
          className="bc-stepper__btn"
          aria-label={`Tambah ${ariaLabel.toLowerCase()}`}
          onClick={inc}
          disabled={atMax}
        >
          +
        </button>
      </div>
    </div>
  );
}
