/* eslint-disable no-console */
/**
 * Catalog seed — departments, subcategories, and products at scale.
 *
 *   pnpm db:seed:catalog                 # top up to CATALOG_COUNT (default 50k)
 *   CATALOG_COUNT=100000 pnpm db:seed:catalog
 *
 * Why this exists alongside seed-bulk.ts: that script issues one nested
 * `product.create` per row (~7 rows/sec — 50k would take two hours). This one
 * uses createMany for products, then variants and images keyed by the ids it
 * generates up front, which is roughly two orders of magnitude faster.
 *
 * Idempotent: products are slugged `cat-<seq>-...` and the run tops up to the
 * target, so re-running after an interrupt resumes rather than duplicating.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient, ProductStatus } from '@prisma/client';
import { TAXONOMY, SUB_SPECS, type DeptSpec, type SubSpec } from './taxonomy';

const prisma = new PrismaClient();

const TARGET = Number(process.env.CATALOG_COUNT ?? 50_000);
const BATCH = 2_000;

const rand = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** Log-ish skew so most products sit nearer the low end of the band, as in real catalogues. */
function skewedPrice([lo, hi]: [number, number]) {
  const t = Math.random() ** 1.7;
  return Math.round(lo + (hi - lo) * t);
}

async function upsertCategories() {
  console.log(`📂  Categories — ${TAXONOMY.length} departments`);
  const subIdBySlug = new Map<string, string>();
  let subCount = 0;

  for (const [i, dept] of TAXONOMY.entries()) {
    const parent = await prisma.category.upsert({
      where: { slug: dept.slug },
      update: { name: dept.name, position: i, parentId: null },
      create: { name: dept.name, slug: dept.slug, position: i },
      select: { id: true },
    });

    for (const [j, sub] of dept.subs.entries()) {
      const row = await prisma.category.upsert({
        where: { slug: sub.slug },
        update: { name: sub.name, position: j, parentId: parent.id },
        create: { name: sub.name, slug: sub.slug, position: j, parentId: parent.id },
        select: { id: true },
      });
      subIdBySlug.set(sub.slug, row.id);
      subCount += 1;
    }
  }
  console.log(`   ${TAXONOMY.length} departments · ${subCount} subcategories`);
  return subIdBySlug;
}

interface Generated {
  product: {
    id: string;
    sellerId: string;
    categoryId: string;
    title: string;
    slug: string;
    description: string;
    brand: string;
    status: ProductStatus;
    minListPrice: number;
    rating: number;
    reviewCount: number;
  };
  variants: Array<{
    productId: string;
    sku: string;
    attrs: Record<string, string>;
    stock: number;
    listPrice: number;
    minPrice: number;
    imageUrl: string;
  }>;
  image: { productId: string; url: string; position: number; alt: string };
}

function generate(dept: DeptSpec, sub: SubSpec, categoryId: string, sellerId: string, seq: number): Generated {
  const brand = rand(dept.brands);
  const type = rand(sub.types);
  const adj = rand(dept.adjectives);
  const title = `${brand} ${adj} ${type}`;
  const slug = `cat-${seq.toString(36)}-${slugify(title)}`.slice(0, 90);
  const id = randomUUID();

  const list = skewedPrice(sub.priceRange);
  const margin = dept.marginPct[0] + Math.random() * (dept.marginPct[1] - dept.marginPct[0]);
  const min = Math.max(50, Math.round(list * (1 - margin)));
  const image = `https://images.unsplash.com/${rand(dept.imageSeeds)}?w=900&q=80`;

  const variants: Generated['variants'] = [];
  const n = Math.random() < 0.55 ? 1 : randInt(2, 3);

  if (sub.attrKey && sub.attrValues?.length) {
    const picked = new Set<string>();
    for (let i = 0; i < n; i += 1) {
      let v = rand(sub.attrValues);
      let guard = 0;
      while (picked.has(v) && guard++ < 6) v = rand(sub.attrValues);
      if (picked.has(v)) continue;
      picked.add(v);
      variants.push({
        productId: id,
        sku: `${slug}-${i}`.toUpperCase().slice(0, 40),
        attrs: { [sub.attrKey]: v, ...(dept.colors ? { color: rand(dept.colors) } : {}) },
        stock: randInt(0, 60),
        listPrice: list,
        minPrice: min,
        imageUrl: image,
      });
    }
  }
  if (variants.length === 0) {
    variants.push({
      productId: id,
      sku: `${slug}-0`.toUpperCase().slice(0, 40),
      attrs: {},
      stock: randInt(0, 60),
      listPrice: list,
      minPrice: min,
      imageUrl: image,
    });
  }

  // Descriptions feed the embedding, so they carry real signal: what it is,
  // which department it belongs to, and a couple of concrete attributes.
  const attrBits = Object.entries(variants[0]!.attrs)
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');
  const description =
    `${title} from ${brand}. ${adj} ${type.toLowerCase()} in the ${sub.name} range` +
    `${attrBits ? ` (${attrBits})` : ''}. Part of our ${dept.name} collection — ` +
    `sold by a Bazaar-verified seller, price negotiable at checkout.`;

  return {
    product: {
      id,
      sellerId,
      categoryId,
      title,
      slug,
      description,
      brand,
      status: ProductStatus.ACTIVE,
      minListPrice: list,
      rating: Math.round((3.2 + Math.random() * 1.8) * 10) / 10,
      reviewCount: randInt(0, 400),
    },
    variants,
    image: { productId: id, url: image, position: 0, alt: title },
  };
}

async function main() {
  const startedAt = Date.now();
  const subIdBySlug = await upsertCategories();

  const sellers = await prisma.seller.findMany({ where: { status: 'APPROVED' }, select: { id: true } });
  if (sellers.length === 0) {
    console.error('✖  No approved sellers. Run `pnpm db:seed` first.');
    process.exit(1);
  }

  const existing = await prisma.product.count();
  console.log(`🌱  Products — have ${existing}, target ${TARGET}`);
  if (existing >= TARGET) {
    console.log('✅  Target already met.');
    return;
  }

  const need = TARGET - existing;
  let made = 0;
  let seq = await prisma.product.count({ where: { slug: { startsWith: 'cat-' } } });

  while (made < need) {
    const size = Math.min(BATCH, need - made);
    const rows: Generated[] = [];

    for (let i = 0; i < size; i += 1) {
      // Round-robin the subcategories so every one of them fills up evenly.
      const { dept, sub } = SUB_SPECS[seq % SUB_SPECS.length]!;
      const categoryId = subIdBySlug.get(sub.slug);
      if (!categoryId) {
        seq += 1;
        continue;
      }
      rows.push(generate(dept, sub, categoryId, rand(sellers).id, seq));
      seq += 1;
    }

    // Three bulk inserts per batch instead of one round-trip per product.
    // skipDuplicates absorbs the rare slug/sku collision without failing the batch.
    await prisma.product.createMany({ data: rows.map((r) => r.product), skipDuplicates: true });
    await prisma.productVariant.createMany({ data: rows.flatMap((r) => r.variants), skipDuplicates: true });
    await prisma.productImage.createMany({ data: rows.map((r) => r.image), skipDuplicates: true });

    made += rows.length;
    const secs = (Date.now() - startedAt) / 1000;
    process.stdout.write(
      `\r   ${existing + made}/${TARGET}  ·  ${(made / secs).toFixed(0)}/s  ·  ${secs.toFixed(0)}s   `,
    );
  }

  process.stdout.write('\n');
  const total = await prisma.product.count();
  console.log(`✅  Done in ${((Date.now() - startedAt) / 1000).toFixed(0)}s — ${total} products total.`);
  console.log('   Next: pnpm db:embed  (makes the new products semantically searchable)');
}

main()
  .catch((e) => {
    console.error('\n✖  Catalog seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
