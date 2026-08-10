export interface ProgressBarProps {
  readonly current: number;
  readonly total: number;
  /** Teks kecil di pojok kanan atas (mis. "1 dari 10"). */
  readonly label?: string;
}

/**
 * Progress bar fixed-top 2px + label "X dari Y" di pojok.
 *
 * Lebar = current/total. Saat current melewati total (semua langkah
 * data selesai), label hilang dan bar penuh.
 */
export function ProgressBar({ current, total, label }: ProgressBarProps) {
  const pct = Math.min(100, Math.round((current / total) * 100));
  const showLabel = current <= total && label !== undefined;
  return (
    <>
      <div
        className="bc-progress"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={label ?? `Langkah ${current} dari ${total}`}
      >
        <div className="bc-progress__fill" style={{ width: `${pct}%` }} />
      </div>
      {showLabel ? <div className="bc-progress__text">{label}</div> : null}
    </>
  );
}
