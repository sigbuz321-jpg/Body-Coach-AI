import { formatEstimate } from './format';

/**
 * Kartu makanan kecil: nama + estimasi kalori satu porsi.
 *
 * `kcal` selalu dirender sebagai estimasi (`±`), tidak pernah sebagai angka
 * pasti — porsi nyata bervariasi dan produk ini tidak berpura-pura tahu berapa
 * gram yang ada di piring seseorang.
 */

export interface FoodCardProps {
  readonly name: string;
  readonly kcal: number;
  /** Label porsi, mis. "porsi bungkus". Ditampilkan sebagai konteks angka. */
  readonly portionLabel?: string;
}

export function FoodCard({ name, kcal, portionLabel }: FoodCardProps) {
  return (
    <div className="bc-food">
      <div className="bc-food__name">{name}</div>
      <div className="bc-num bc-food__kcal">{formatEstimate(kcal, 'kkal')}</div>
      {portionLabel ? <div className="bc-food__portion">{portionLabel}</div> : null}
    </div>
  );
}
