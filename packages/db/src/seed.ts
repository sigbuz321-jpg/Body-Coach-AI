import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'csv-parse/sync';
import { z } from 'zod';

import { withDirectClient } from './client';

const SEED_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'data',
  'seeds',
  'food',
);

const boolish = z.enum(['true', 'false']).transform((v) => v === 'true');

const foodSchema = z.object({
  slug: z.string().min(1),
  name_id: z.string().min(1),
  name_en: z.string(),
  category: z.string().min(1),
  kcal_per_100g: z.coerce.number().nonnegative(),
  protein_per_100g: z.coerce.number().nonnegative(),
  carbs_per_100g: z.coerce.number().nonnegative(),
  fat_per_100g: z.coerce.number().nonnegative(),
  source: z.string().min(1),
  verified: boolish,
});

const aliasSchema = z.object({
  slug: z.string().min(1),
  alias: z.string().min(1),
  weight: z.coerce.number().min(0).max(1),
});

const portionSchema = z.object({
  slug: z.string().min(1),
  label: z.string().min(1),
  grams: z.coerce.number().positive(),
  is_default: boolish,
});

type Food = z.infer<typeof foodSchema>;
type Alias = z.infer<typeof aliasSchema>;
type Portion = z.infer<typeof portionSchema>;

function readCsv<T>(file: string, schema: z.ZodType<T>): T[] {
  const raw = readFileSync(join(SEED_DIR, file), 'utf8');
  const records: unknown[] = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  return records.map((r, i) => {
    const result = schema.safeParse(r);
    if (!result.success) {
      throw new Error(
        `${file} baris ${i + 2}: ${result.error.issues[0]?.message ?? 'tidak valid'}`,
      );
    }
    return result.data;
  });
}

/**
 * Gerbang mutu sebelum data masuk. Food database adalah L1 "Truth"
 * (docs/01-system-design.md §6.1) — kalau isinya tidak konsisten, seluruh
 * angka di produk salah dan tidak ada guardrail di lapisan atas yang bisa
 * menyelamatkannya.
 */
function validate(foods: Food[], aliases: Alias[], portions: Portion[]): void {
  const errors: string[] = [];
  const slugs = new Set(foods.map((f) => f.slug));

  if (slugs.size !== foods.length) errors.push('ada slug duplikat di foods.csv');

  for (const a of aliases) {
    if (!slugs.has(a.slug)) errors.push(`alias "${a.alias}" merujuk slug tidak dikenal: ${a.slug}`);
  }
  for (const p of portions) {
    if (!slugs.has(p.slug)) errors.push(`porsi "${p.label}" merujuk slug tidak dikenal: ${p.slug}`);
  }

  for (const f of foods) {
    // Makro harus menjelaskan kalorinya. Toleransi longgar karena pembulatan
    // dan serat, tapi cukup ketat untuk menangkap salah ketik satu digit.
    const computed = f.protein_per_100g * 4 + f.carbs_per_100g * 4 + f.fat_per_100g * 9;
    const diff = Math.abs(computed - f.kcal_per_100g);
    if (diff > 10 && diff / Math.max(f.kcal_per_100g, 1) > 0.15) {
      errors.push(
        `${f.slug}: makro tidak konsisten dengan kkal — tertulis ${f.kcal_per_100g}, ` +
          `dari makro ${computed.toFixed(1)}`,
      );
    }

    const n = aliases.filter((a) => a.slug === f.slug).length;
    if (n < 3) errors.push(`${f.slug}: hanya ${n} alias, minimal 3`);

    const own = portions.filter((p) => p.slug === f.slug);
    if (own.length < 2) errors.push(`${f.slug}: hanya ${own.length} porsi, minimal 2`);
    const defaults = own.filter((p) => p.is_default).length;
    if (defaults !== 1) errors.push(`${f.slug}: ada ${defaults} porsi default, harus tepat 1`);
  }

  if (errors.length > 0) {
    throw new Error(`Seed ditolak, ${errors.length} masalah:\n  - ${errors.join('\n  - ')}`);
  }
}

export async function seed(): Promise<void> {
  const foods = readCsv('foods.csv', foodSchema);
  const aliases = readCsv('aliases.csv', aliasSchema);
  const portions = readCsv('portions.csv', portionSchema);

  validate(foods, aliases, portions);
  console.log(
    `Data lolos validasi: ${foods.length} makanan, ${aliases.length} alias, ${portions.length} porsi.`,
  );

  await withDirectClient(async (client) => {
    await client.query('BEGIN');
    try {
      const idBySlug = new Map<string, string>();

      // Upsert berdasarkan name_id. Tidak memakai ON CONFLICT karena skema §3
      // sengaja tidak memberi UNIQUE pada name_id — dua makanan boleh bernama
      // sama kalau nanti berbeda sumber atau daerah.
      for (const f of foods) {
        const existing = await client.query<{ id: string }>(
          'SELECT id FROM food_items WHERE name_id = $1 LIMIT 1',
          [f.name_id],
        );
        // name_id adalah kunci pencarian, jadi tidak ikut diperbarui.
        const fields = [
          f.name_en || null,
          f.category,
          f.kcal_per_100g,
          f.protein_per_100g,
          f.carbs_per_100g,
          f.fat_per_100g,
          f.source,
          f.verified,
        ];

        const row = existing.rows[0];
        if (row) {
          await client.query(
            `UPDATE food_items SET
               name_en = $1, category = $2, kcal_per_100g = $3, protein_per_100g = $4,
               carbs_per_100g = $5, fat_per_100g = $6, source = $7, verified = $8
             WHERE id = $9`,
            [...fields, row.id],
          );
          idBySlug.set(f.slug, row.id);
        } else {
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO food_items
               (name_id, name_en, category, kcal_per_100g, protein_per_100g,
                carbs_per_100g, fat_per_100g, source, verified)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             RETURNING id`,
            [f.name_id, ...fields],
          );
          const created = inserted.rows[0];
          if (!created) throw new Error(`gagal menyisipkan ${f.slug}`);
          idBySlug.set(f.slug, created.id);
        }
      }

      for (const a of aliases) {
        const foodId = idBySlug.get(a.slug);
        if (!foodId) throw new Error(`slug tidak terpetakan: ${a.slug}`);
        await client.query(
          `INSERT INTO food_aliases (food_item_id, alias, weight)
           VALUES ($1,$2,$3)
           ON CONFLICT (alias_norm, food_item_id) DO UPDATE SET weight = EXCLUDED.weight`,
          [foodId, a.alias, a.weight],
        );
      }

      for (const p of portions) {
        const foodId = idBySlug.get(p.slug);
        if (!foodId) throw new Error(`slug tidak terpetakan: ${p.slug}`);
        const existing = await client.query<{ id: string }>(
          'SELECT id FROM food_portions WHERE food_item_id = $1 AND label = $2 LIMIT 1',
          [foodId, p.label],
        );
        const row = existing.rows[0];
        if (row) {
          await client.query('UPDATE food_portions SET grams = $2, is_default = $3 WHERE id = $1', [
            row.id,
            p.grams,
            p.is_default,
          ]);
        } else {
          await client.query(
            'INSERT INTO food_portions (food_item_id, label, grams, is_default) VALUES ($1,$2,$3,$4)',
            [foodId, p.label, p.grams, p.is_default],
          );
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    const { rows } = await client.query<{ t: string; a: string; p: string }>(
      `SELECT (SELECT count(*) FROM food_items)   AS t,
              (SELECT count(*) FROM food_aliases) AS a,
              (SELECT count(*) FROM food_portions) AS p`,
    );
    const c = rows[0];
    console.log(`Selesai. Di database: ${c?.t} makanan, ${c?.a} alias, ${c?.p} porsi.`);
  });
}

await seed();
