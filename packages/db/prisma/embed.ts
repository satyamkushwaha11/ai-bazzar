/* eslint-disable no-console */
/**
 * Backfill product embeddings for semantic search.
 *
 *   pnpm db:embed              # embed everything missing/changed
 *   FORCE=1 pnpm db:embed      # re-embed everything (e.g. after editing embedText)
 *   EMBED_CONCURRENCY=8        # parallel OpenAI requests (default 6)
 *
 * Idempotent: rows whose embedded text hashes the same are skipped, so a
 * re-run after an interrupt resumes instead of paying twice.
 *
 * Two things make this fast enough for a 50k catalogue, both learned the hard
 * way from a first version that would have taken ~24 hours:
 *   1. Embedding requests run concurrently — one at a time is latency-bound.
 *   2. Each batch writes with ONE bulk `UPDATE ... FROM (VALUES ...)` rather
 *      than 96 statements. Every vector is ~30KB of text, so per-row round
 *      trips to a remote Postgres dominate everything else.
 *
 * Deliberately standalone rather than importing apps/web — this package has no
 * dependency on the Next app, and the script must run in CI/cron.
 */
import { createHash } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import OpenAI from 'openai';

const MODEL = 'text-embedding-3-small';
/**
 * 512, not the model's full 1536.
 *
 * Writing vectors to a remote Postgres is network-bound — measured at ~33s per
 * 96-row batch at 1536 dims, and the time scales linearly with payload size.
 * text-embedding-3-small is a Matryoshka model, so a 512-dim prefix keeps
 * essentially all of its retrieval quality for catalogue search at a third of
 * the bytes (and a third of the storage and index size).
 *
 * Changing this means re-embedding everything AND altering the column type —
 * keep it in step with EMBED_DIMS in apps/web/server/services/embeddings.ts.
 */
const DIMS = 512;
/** Decimal places kept per component. 17 significant digits is pure payload. */
const PRECISION = 6;
const BATCH = 96;
const PAGE = 2_000;
const CONCURRENCY = Number(process.env.EMBED_CONCURRENCY ?? 6);

/**
 * Each worker holds a connection for the duration of its bulk UPDATE, so the
 * pool has to exceed the worker count — Prisma's default of 5 deadlocks the
 * moment concurrency goes above it.
 */
function poolUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  const u = new URL(raw);
  u.searchParams.set('connection_limit', String(CONCURRENCY + 3));
  u.searchParams.set('pool_timeout', '60');
  return u.toString();
}

const prisma = new PrismaClient({
  datasources: { db: { url: poolUrl() } },
});

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('✖  OPENAI_API_KEY is not set — cannot embed.');
  process.exit(1);
}
const openai = new OpenAI({ apiKey, maxRetries: 4 });
const force = process.env.FORCE === '1';

interface Row {
  id: string;
  title: string;
  brand: string | null;
  description: string;
  attrs: unknown;
  category: { name: string } | null;
  embedHash: string | null;
}

/** Must stay in sync with apps/web/server/services/embeddings.ts:embedText. */
function embedText(p: Row): string {
  const attrs = p.attrs && typeof p.attrs === 'object' ? (p.attrs as Record<string, unknown>) : {};
  const attrText = Object.entries(attrs)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(', ');
  return [p.title, p.brand ?? '', p.category?.name ?? '', attrText, (p.description ?? '').slice(0, 600)]
    .filter(Boolean)
    .join('\n')
    .trim();
}

const hashText = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32);

interface Pending {
  id: string;
  text: string;
  hash: string;
}

/** pgvector literal, trimmed of digits that cost bandwidth and buy nothing. */
const toLiteral = (v: number[]) => `[${v.map((x) => x.toFixed(PRECISION)).join(',')}]`;

/** Embed one batch and write it back in a single statement. */
async function processBatch(chunk: Pending[]): Promise<number> {
  const res = await openai.embeddings.create({
    model: MODEL,
    input: chunk.map((c) => c.text),
    dimensions: DIMS,
  });
  const vectors = [...res.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);

  const values = Prisma.join(
    chunk.map(
      (c, j) =>
        Prisma.sql`(${c.id}::text, ${toLiteral(vectors[j]!)}::vector, ${c.hash}::text)`,
    ),
  );

  await prisma.$executeRaw`
    UPDATE "Product" AS p
    SET embedding = v.emb, "embedHash" = v.hash
    FROM (VALUES ${values}) AS v(id, emb, hash)
    WHERE p.id = v.id
  `;
  return chunk.length;
}

/** Run tasks with a bounded worker pool. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<number>) {
  let cursor = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      done += await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return done;
}

async function main() {
  const startedAt = Date.now();
  const total = await prisma.product.count({ where: { status: 'ACTIVE' } });
  console.log(
    `🧭  Embedding ACTIVE products — ${total} total${force ? ' (FORCE)' : ''} · concurrency ${CONCURRENCY}`,
  );

  let cursor: string | undefined;
  let embedded = 0;
  let skipped = 0;
  let scanned = 0;

  for (;;) {
    const page: Row[] = await prisma.product.findMany({
      where: { status: 'ACTIVE' },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        title: true,
        brand: true,
        description: true,
        attrs: true,
        embedHash: true,
        category: { select: { name: true } },
      },
    });
    if (page.length === 0) break;
    cursor = page[page.length - 1]!.id;
    scanned += page.length;

    const pending = page.flatMap<Pending>((p) => {
      const text = embedText(p);
      if (!text) return [];
      const hash = hashText(text);
      if (!force && p.embedHash === hash) {
        skipped += 1;
        return [];
      }
      return [{ id: p.id, text, hash }];
    });

    const batches: Pending[][] = [];
    for (let i = 0; i < pending.length; i += BATCH) batches.push(pending.slice(i, i + BATCH));

    embedded += await pool(batches, CONCURRENCY, processBatch);

    const secs = (Date.now() - startedAt) / 1000;
    const rate = embedded / Math.max(secs, 1);
    const left = rate > 0 ? Math.round((total - scanned) / rate) : 0;
    process.stdout.write(
      `\r   embedded ${embedded} · skipped ${skipped} · ${scanned}/${total} · ${rate.toFixed(0)}/s · ~${left}s left   `,
    );
  }

  process.stdout.write('\n');

  const [{ n }] = await prisma.$queryRaw<Array<{ n: number }>>(
    Prisma.sql`SELECT count(*)::int AS n FROM "Product" WHERE status='ACTIVE' AND embedding IS NOT NULL`,
  );
  console.log(
    `✅  Done in ${((Date.now() - startedAt) / 1000).toFixed(0)}s — ${embedded} embedded, ${skipped} unchanged. ` +
      `${n}/${total} ACTIVE products searchable.`,
  );
}

main()
  .catch((e) => {
    console.error('\n✖  Embed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
