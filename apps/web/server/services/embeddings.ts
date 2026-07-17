import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { openai } from '@/server/ai/client';

/**
 * Product embeddings for semantic retrieval (RAG).
 *
 * Prisma has no native `vector` type, so the column is declared Unsupported and
 * every read/write here goes through $queryRaw. Vectors are passed as their
 * pgvector text form ('[0.1,0.2,...]') and cast, which is safe under
 * parameterisation and avoids a driver-level array round-trip.
 */

export const EMBED_MODEL = 'text-embedding-3-small';

/**
 * 512, not the model's full 1536.
 *
 * Writing vectors to a remote Postgres is network-bound and the cost scales
 * linearly with payload. text-embedding-3-small is a Matryoshka model, so a
 * 512-dim prefix keeps essentially all of its catalogue-search quality at a
 * third of the bytes, storage and index size.
 *
 * MUST match DIMS in packages/db/prisma/embed.ts and the vector(512) column —
 * a mismatch makes every query error rather than silently degrade.
 */
export const EMBED_DIMS = 512;

/** Decimal places kept per component. 17 significant digits is pure payload. */
const PRECISION = 6;

/** Max rows per OpenAI embeddings request. Well under the token ceiling. */
const BATCH = 96;

export interface EmbeddableProduct {
  id: string;
  title: string;
  brand: string | null;
  description: string;
  attrs: unknown;
  category?: { name: string } | null;
}

/**
 * The text we embed. Ordered most- to least-salient: a buyer's query ("something
 * for my evening jog") is matched mostly on title/category/brand, so those lead.
 * Description is truncated — long marketing copy dilutes the vector.
 */
export function embedText(p: EmbeddableProduct): string {
  const attrs = p.attrs && typeof p.attrs === 'object' ? (p.attrs as Record<string, unknown>) : {};
  const attrText = Object.entries(attrs)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(', ');

  return [
    p.title,
    p.brand ?? '',
    p.category?.name ?? '',
    attrText,
    (p.description ?? '').slice(0, 600),
  ]
    .filter(Boolean)
    .join('\n')
    .trim();
}

export const hashText = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32);

/** pgvector literal, trimmed of digits that cost bandwidth and buy nothing. */
const toVectorLiteral = (v: number[]) => `[${v.map((x) => x.toFixed(PRECISION)).join(',')}]`;

/** Embed raw strings. Throws if AI is unconfigured — callers decide the fallback. */
export async function embedStrings(texts: string[]): Promise<number[][]> {
  if (!openai) throw new Error('OPENAI_API_KEY is not configured — cannot embed');
  if (texts.length === 0) return [];

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const chunk = texts.slice(i, i + BATCH);
    const res = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: chunk,
      dimensions: EMBED_DIMS,
    });
    // The API preserves input order, but sort by index rather than trust it.
    out.push(...[...res.data].sort((a, b) => a.index - b.index).map((d) => d.embedding));
  }
  return out;
}

/** Embed a single query string. Returns null when AI is unavailable. */
export async function embedQuery(q: string): Promise<number[] | null> {
  if (!openai) return null;
  try {
    const [v] = await embedStrings([q]);
    return v ?? null;
  } catch {
    return null;
  }
}

/**
 * Write embeddings for the given products, skipping any whose text is unchanged.
 * Returns how many were actually re-embedded.
 */
export async function embedProducts(products: EmbeddableProduct[]): Promise<number> {
  const pending: Array<{ id: string; text: string; hash: string }> = [];

  const existing = await prisma.product.findMany({
    where: { id: { in: products.map((p) => p.id) } },
    select: { id: true, embedHash: true },
  });
  const hashById = new Map(existing.map((e) => [e.id, e.embedHash]));

  for (const p of products) {
    const text = embedText(p);
    if (!text) continue;
    const hash = hashText(text);
    if (hashById.get(p.id) === hash) continue; // unchanged — don't pay to re-embed
    pending.push({ id: p.id, text, hash });
  }
  if (pending.length === 0) return 0;

  const vectors = await embedStrings(pending.map((p) => p.text));

  for (let i = 0; i < pending.length; i += 1) {
    const row = pending[i]!;
    const vec = vectors[i];
    if (!vec) continue;
    await prisma.$executeRaw`
      UPDATE "Product"
      SET embedding = ${toVectorLiteral(vec)}::vector, "embedHash" = ${row.hash}
      WHERE id = ${row.id}
    `;
  }
  return pending.length;
}

/** Fire-and-forget re-embed for one product. Never throws into the caller. */
export async function reembedProduct(productId: string): Promise<void> {
  try {
    const p = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        title: true,
        brand: true,
        description: true,
        attrs: true,
        category: { select: { name: true } },
      },
    });
    if (p) await embedProducts([p]);
  } catch (err) {
    console.error('[embeddings] re-embed failed for', productId, err);
  }
}

export interface SemanticHit {
  id: string;
  /** Cosine distance, 0 = identical. */
  distance: number;
}

/**
 * A companion product the shopkeeper can genuinely offer to bundle.
 *
 * Constrained to the SAME seller — cross-selling a competitor's product does
 * nothing for the seller trying to close, and they cannot discount it.
 *
 * The distance window is deliberate: too near (< 0.25) and it's a near-duplicate
 * of what the buyer is already holding, which is a pointless bundle; too far and
 * it's unrelated. The band in between is "related but different" — the sweet
 * spot for "add this and I'll do you a deal on both".
 *
 * Returns the title, or null when nothing suitable exists — in which case the
 * BUNDLE tactic is simply never offered rather than invented.
 */
export async function findBundleCandidate(
  productId: string,
  sellerId: string,
): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ title: string; distance: number }>>`
    SELECT p.title, (p.embedding <=> src.embedding) AS distance
    FROM "Product" p
    CROSS JOIN (SELECT embedding FROM "Product" WHERE id = ${productId}) AS src
    JOIN "ProductVariant" v ON v."productId" = p.id AND v.stock > 0
    WHERE p.status = 'ACTIVE'
      AND p."sellerId" = ${sellerId}
      AND p.id <> ${productId}
      AND p.embedding IS NOT NULL
      AND src.embedding IS NOT NULL
      AND (p.embedding <=> src.embedding) BETWEEN 0.25 AND 0.6
    ORDER BY p.embedding <=> src.embedding
    LIMIT 1
  `;
  return rows[0]?.title ?? null;
}

/**
 * "More like this" — nearest neighbours of a product's OWN embedding.
 *
 * The vector is compared inside Postgres rather than fetched and sent back,
 * which keeps a ~7KB round trip out of every product page render.
 *
 * `maxDistance` guards against the tail: on a narrow category the third-nearest
 * product may be nothing like the first, and showing an unrelated item under
 * "Similar products" is worse than showing fewer.
 */
export async function similarProducts(
  productId: string,
  opts: { limit?: number; maxDistance?: number } = {},
): Promise<string[]> {
  const { limit = 3, maxDistance = 0.45 } = opts;

  const rows = await prisma.$queryRaw<Array<{ id: string; distance: number }>>`
    SELECT p.id, (p.embedding <=> src.embedding) AS distance
    FROM "Product" p
    CROSS JOIN (SELECT embedding FROM "Product" WHERE id = ${productId}) AS src
    WHERE p.status = 'ACTIVE'
      AND p.embedding IS NOT NULL
      AND src.embedding IS NOT NULL
      AND p.id <> ${productId}
    ORDER BY p.embedding <=> src.embedding
    LIMIT ${limit}
  `;

  return rows.filter((r) => Number(r.distance) <= maxDistance).map((r) => r.id);
}

/**
 * Nearest products to a query vector, restricted to ACTIVE + embedded rows.
 *
 * `ids` optionally narrows the candidate set to a pre-filtered list, which is
 * how price/category facets compose with semantic ranking without a second
 * ranking pass.
 */
export async function semanticSearch(
  vector: number[],
  opts: { limit?: number; ids?: string[]; maxDistance?: number } = {},
): Promise<SemanticHit[]> {
  const { limit = 24, ids, maxDistance } = opts;

  // An explicitly empty candidate list means "nothing passed the filters" —
  // not "no filter". Skip the query rather than returning the whole catalogue.
  if (ids && ids.length === 0) return [];

  const lit = toVectorLiteral(vector);
  const narrow = ids?.length ? Prisma.sql`AND id IN (${Prisma.join(ids)})` : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<{ id: string; distance: number }>>`
    SELECT id, (embedding <=> ${lit}::vector) AS distance
    FROM "Product"
    WHERE status = 'ACTIVE'
      AND embedding IS NOT NULL
      ${narrow}
    ORDER BY embedding <=> ${lit}::vector
    LIMIT ${limit}
  `;

  return rows
    .map((r) => ({ id: r.id, distance: Number(r.distance) }))
    .filter((r) => (maxDistance == null ? true : r.distance <= maxDistance));
}
