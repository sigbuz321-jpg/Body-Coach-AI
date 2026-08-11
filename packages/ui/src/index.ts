/**
 * @bodycoach/ui — design system "Piring & Plat" (docs/03-design-system.md).
 *
 * Komponen memakai token dari tokens.css. styles.css adalah Consumer CSS
 * yang bisa diimpor oleh aplikasi (apps/web/app/globals.css) — ia memakai
 * awalan `bc-` untuk semua kelas dan tidak menggunakan Tailwind, sehingga
 * tidak ada coupling ke utility framework.
 *
 * Stylelist catatan:
 * - Semua angka memakai `font-variant-numeric: tabular-nums` (.bc-num).
 * - Tap target minimum 44px (diupgrade ke 48/52 untuk tombol).
 * - Reduced-motion dihormati di tokens.css dan diulang pada animasi apa pun.
 *
 * Boundary Next.js: file ini aman diimpor dari server component (layout.tsx)
 * karena CSS-nya pure side-effect. Komponen yang memakai hooks (PlanExplainer)
 * mendeklarasikan 'use client' sendiri, jadi tidak membocorkan hook ke server.
 */

import './tokens.css';
import './styles.css';

export { Button } from './Button';
export type { ButtonProps, ButtonVariant } from './Button';

export { Chip } from './Chip';
export type { ChipProps } from './Chip';

export { Faq } from './Faq';
export type { FaqItem, FaqProps } from './Faq';

export { FoodCard } from './FoodCard';
export type { FoodCardProps } from './FoodCard';

export { GoalCard } from './GoalCard';
export type { GoalCardProps, GoalValue } from './GoalCard';

export { MacroBar } from './MacroBar';
export type { MacroBarProps, MacroKey } from './MacroBar';

export { PlanCard } from './PlanCard';
export type { PlanCardProps } from './PlanCard';

export { PlanExplainer } from './PlanExplainer';

export { PlateStack } from './PlateStack';
export type { PlateStackProps } from './PlateStack';

export { PricingCard } from './PricingCard';
export type { PricingCardProps } from './PricingCard';

export { ProgressBar } from './ProgressBar';
export type { ProgressBarProps } from './ProgressBar';

export { Slider } from './Slider';
export type { SliderProps } from './Slider';

export { Stepper } from './Stepper';
export type { StepperProps } from './Stepper';

export {
  formatDecimal2,
  formatEstimate,
  formatIdr,
  formatInt,
  formatKg,
  formatWeight,
  formatWeekRange,
  formatWeeklyRate,
} from './format';

export const UI_PACKAGE = '@bodycoach/ui' as const;
