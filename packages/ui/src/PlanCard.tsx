import { formatInt, formatKg, formatWeekRange } from './format';
import { MacroBar } from './MacroBar';

export interface PlanCardProps {
  readonly goal: 'bulk' | 'cut' | 'maintain';
  readonly currentWeightKg: number;
  readonly targetWeightKg: number;
  readonly kcal: number;
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
  /** Rentang minggu, null untuk maintain. */
  readonly timelineMinWeeks: number | null;
  readonly timelineMaxWeeks: number | null;
  /** Laju mingguan dalam kg (positif bulk, negatif cut, 0 maintain). */
  readonly weeklyKg: number;
}

/**
 * Kartu rencana: sekarang → target, kkal harian, makro, perkiraan waktu.
 *
 * Mengikuti layout dari design/Rencana-_-WhatsApp.dc.html "Layar A":
 * - Baris atas: label goal + dua angka berat (sekarang → target) dengan panah.
 * - Kartu besar dengan enamel rim, kkal XL, makro bar (P hijau / K kuning /
 *   L biru), garis tipis, lalu perkiraan durasi dengan ikon jam.
 *
 * Aturan warna makro diambil dari versi Rencana (plan reveal), bukan
 * Dashboard — lihat CLAUDE.md konflik no. 1.
 */
export function PlanCard({
  goal,
  currentWeightKg,
  targetWeightKg,
  kcal,
  proteinG,
  carbsG,
  fatG,
  timelineMinWeeks,
  timelineMaxWeeks,
  weeklyKg,
}: PlanCardProps) {
  const goalLabel = goal.toUpperCase();
  const timeline =
    timelineMinWeeks !== null && timelineMaxWeeks !== null
      ? formatWeekRange(timelineMinWeeks, timelineMaxWeeks)
      : null;

  const rateSign = weeklyKg > 0 ? '+' : weeklyKg < 0 ? '−' : '';
  const weeklyAbs = Math.abs(weeklyKg).toFixed(2).replace('.', ',');
  const rateText = `${rateSign}${weeklyAbs} kg/minggu`;

  return (
    <section className="bc-plan" aria-label="Rencana nutrisi kamu">
      <div className="bc-plan__head">
        <div className="bc-plan__eyebrow">
          Rencana <span className={`bc-plan__goal bc-plan__goal--${goal}`}>{goalLabel}</span> kamu
        </div>
        <div className="bc-plan__weights">
          <div className="bc-plan__weight">
            <div className="bc-plan__weight-label">Sekarang</div>
            <div className="bc-num bc-plan__weight-value bc-plan__weight-value--muted">
              {formatKg(currentWeightKg)}
              <span className="bc-plan__weight-unit"> kg</span>
            </div>
          </div>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 12h14M13 7l5 5-5 5"
              stroke="var(--enamel-400)"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="bc-plan__weight">
            <div className="bc-plan__weight-label">Target</div>
            <div className="bc-num bc-plan__weight-value">
              {formatKg(targetWeightKg)}
              <span className="bc-plan__weight-unit"> kg</span>
            </div>
          </div>
        </div>
      </div>

      <article className="bc-plan__hero">
        <div className="bc-plan__hero-inner">
          <div className="bc-plan__kcal">
            <div className="bc-num bc-plan__kcal-number">{formatInt(kcal)}</div>
            <div className="bc-plan__kcal-unit">kkal per hari</div>
          </div>

          <div className="bc-plan__divider" />

          <div className="bc-plan__macros">
            <div className="bc-plan__macros-label">Target makro harian</div>
            <div className="bc-plan__macros-list">
              <MacroBar kind="protein" value={0} target={proteinG} />
              <MacroBar kind="carbs" value={0} target={carbsG} />
              <MacroBar kind="fat" value={0} target={fatG} />
            </div>
            <div className="bc-plan__macros-hint">
              Bar terisi setiap kamu catat makan di WhatsApp.
            </div>
          </div>

          <div className="bc-plan__divider" />

          {timeline !== null ? (
            <div className="bc-plan__timeline">
              <div className="bc-plan__timeline-row">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.25" stroke="var(--iron-600)" strokeWidth={1.75} />
                  <path
                    d="M12 8v4.2l2.6 1.6"
                    stroke="var(--iron-600)"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="bc-plan__timeline-text">
                  Perkiraan <span className="bc-num bc-plan__timeline-value">{timeline}</span>
                </span>
              </div>
              <div className="bc-plan__timeline-hint">
                Perkiraan berdasarkan laju {rateText}. Akan disesuaikan tiap minggu dari berat
                terbaru kamu.
              </div>
            </div>
          ) : (
            <div className="bc-plan__timeline">
              <div className="bc-plan__timeline-row">
                <span className="bc-plan__timeline-text">
                  Kamu memilih menjaga berat. Tidak ada target waktu — fokus ke pola makan
                  konsisten.
                </span>
              </div>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
