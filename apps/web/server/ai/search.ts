import { z } from 'zod';
import { openai, MODEL } from './client';
import { prisma } from '@/server/db';

export const SearchFilterSchema = z.object({
  query: z.string().default(''),
  categorySlugs: z.array(z.string()).default([]),
  minPrice: z.number().nullable().default(null),
  maxPrice: z.number().nullable().default(null),
  brands: z.array(z.string()).default([]),
  attrs: z.record(z.string(), z.string()).default({}),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'newest', 'rating']).default('relevance'),
});
export type SearchFilter = z.infer<typeof SearchFilterSchema>;

/**
 * Department slugs, cached in module scope for a few minutes.
 *
 * These must come from the database. Hardcoding them means every taxonomy
 * change silently teaches the model that real departments do not exist, and it
 * then emits slugs that match nothing.
 */
let deptCache: { slugs: string[]; at: number } | null = null;
const DEPT_TTL_MS = 5 * 60 * 1000;

async function departmentSlugs(): Promise<string[]> {
  if (deptCache && Date.now() - deptCache.at < DEPT_TTL_MS) return deptCache.slugs;
  const rows = await prisma.category.findMany({
    where: { parentId: null },
    orderBy: { position: 'asc' },
    select: { slug: true },
  });
  deptCache = { slugs: rows.map((r) => r.slug), at: Date.now() };
  return deptCache.slugs;
}

function systemPrompt(slugs: string[]) {
  return `You convert a buyer's natural-language query into a JSON product filter.

Return STRICT JSON ONLY (no prose, no markdown), matching this shape:
{
  "query": string,                       // residual keywords after filters are extracted
  "categorySlugs": string[],             // ONLY from this list: ${slugs.join(', ')}
  "minPrice": number | null,             // INR
  "maxPrice": number | null,             // INR. "under 2k" => 2000, "below 5000" => 5000
  "brands": string[],
  "attrs": { [key:string]: string },     // size, color, material, etc.
  "sort": "relevance" | "price_asc" | "price_desc" | "newest" | "rating"
}

Rules:
- "query" holds ONLY the product keywords left after removing filter words. Strip
  price words ("cheap", "under 2k"), sort words ("best", "top rated") and the
  category itself. If nothing meaningful remains, return "".
- Never invent a categorySlug outside the list above. When unsure, use [].

Examples:
"cheap running shoes under 2k"
=> {"query":"running","categorySlugs":["footwear"],"minPrice":null,"maxPrice":2000,"brands":[],"attrs":{},"sort":"price_asc"}

"black wireless earbuds top rated"
=> {"query":"wireless earbuds","categorySlugs":["electronics"],"minPrice":null,"maxPrice":null,"brands":[],"attrs":{"color":"black"},"sort":"rating"}`;
}

export async function parseSearch(naturalQuery: string): Promise<SearchFilter> {
  if (!openai) {
    // Fallback: keyword-only.
    return SearchFilterSchema.parse({ query: naturalQuery });
  }
  try {
    const slugs = await departmentSlugs();
    const res = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: 300,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt(slugs) },
        { role: 'user', content: naturalQuery },
      ],
    });
    const text = res.choices[0]?.message?.content ?? '{}';
    const parsed = SearchFilterSchema.parse(JSON.parse(text));
    // Drop hallucinated slugs rather than filtering the catalogue down to nothing.
    const valid = new Set(slugs);
    return { ...parsed, categorySlugs: parsed.categorySlugs.filter((s) => valid.has(s)) };
  } catch {
    return SearchFilterSchema.parse({ query: naturalQuery });
  }
}
