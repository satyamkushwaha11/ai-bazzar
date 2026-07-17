import type OpenAI from 'openai';
import { prisma } from '@/server/db';
import { embedQuery, semanticSearch } from '@/server/services/embeddings';

/**
 * Tools for the RAG shopping assistant.
 *
 * SAFETY: every read here is buyer-facing and must never touch
 * ProductVariant.minPrice — that is the seller's private floor, and the
 * assistant's output goes straight to the buyer (and into an LLM context that
 * a buyer can try to talk their way into). Selects are explicit for that reason;
 * do not replace them with `include`.
 *
 * The assistant also never negotiates. Haggling happens once, at checkout, over
 * the whole basket — the system prompt below redirects any price-pushing there.
 */

export interface AssistantProduct {
  slug: string;
  title: string;
  brand: string | null;
  price: number;
  rating: number;
  reviewCount: number;
  imageUrl: string | null;
  seller: string;
  department: string | null;
}

export interface CartAction {
  variantId: string;
  qty: number;
  title: string;
  price: number;
}

const num = (d: unknown) => (d == null ? 0 : Number(d));

export const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_products',
      description:
        'Search the product catalogue by meaning. Use this for ANY request to find, ' +
        'recommend, compare or browse products. Understands vague intent ' +
        '("something for my evening jog"). Returns real products with real prices.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'What the buyer is looking for, in natural language.',
          },
          minPrice: { type: 'number', description: 'Minimum price in INR.' },
          maxPrice: { type: 'number', description: 'Maximum price in INR.' },
          department: {
            type: 'string',
            description: 'Optional department slug to restrict to, e.g. "footwear".',
          },
          limit: { type: 'number', description: 'How many to return (default 4, max 8).' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product',
      description:
        'Full detail for one product by slug: description, specifications, and the ' +
        'buyable variants with their ids. Call this before add_to_cart to pick a variant.',
      parameters: {
        type: 'object',
        properties: { slug: { type: 'string' } },
        required: ['slug'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_to_cart',
      description:
        "Add a variant to the buyer's cart. Only call this when the buyer has clearly " +
        'asked for it ("add it", "I\'ll take the first one"). Never add something they ' +
        'only asked about. Use a variantId returned by get_product.',
      parameters: {
        type: 'object',
        properties: {
          variantId: { type: 'string' },
          qty: { type: 'number', description: 'Default 1.' },
        },
        required: ['variantId'],
        additionalProperties: false,
      },
    },
  },
];

export const SYSTEM_PROMPT = `You are the AI Bazaar shopping assistant — a sharp, friendly Indian shop assistant helping a buyer find things in a large marketplace.

HOW YOU WORK
- ALWAYS call search_products before recommending anything. You have no product knowledge of your own; never invent products, prices, brands or availability.
- Recommend 2-4 options, not a catalogue dump.

OUTPUT FORMAT — important:
The interface renders every product you found as a rich card (image, title, price,
rating) directly beneath your message. So:
- NEVER output markdown images, links, or URLs. Never paste an image address. The cards handle that.
- NEVER re-list the products with their prices and ratings. The card already shows all of that, and repeating it reads as duplicated clutter.
- Instead write 1-2 short sentences of genuine guidance — which one you'd pick and why, or what separates them. Refer to items by name only.
- Good: "The **IronOak Lightweight** is the one I'd take — best rated of the bunch, and it'll keep ice solid all day. The Pulse Studio is cheaper if you're just after cold water."
- Bad: a numbered list repeating every title, price and rating.
- You MAY use **bold** for a product name or a price, and short bullet lists when genuinely comparing. Nothing else — no headings, tables or block quotes; this is a narrow chat bubble.
- Prices are in Indian Rupees. If you do mention one, quote it exactly as returned — never round or estimate.
- Match the buyer's language (English / Hinglish). Sound like a person, not a brochure.

ADDING TO CART
- Only call add_to_cart on a clear instruction ("add it", "I'll take that one").
- A product may have several variants (size/colour). If which one is ambiguous, ASK before adding — do not guess.
- Call get_product first to get real variant ids. Never invent an id.

NEGOTIATION
- You do NOT negotiate and you cannot change a price. If they push for a discount, tell them warmly that every price here is negotiable — they can open the product and hit "Negotiate price" to haggle with the shopkeeper before adding it to the cart.
- Never discuss, hint at, or speculate about a seller's minimum, floor, cost or margin. You do not know them.

If a search returns nothing, say so plainly and suggest a broader query. Never pretend.`;

interface SearchArgs {
  query: string;
  minPrice?: number;
  maxPrice?: number;
  department?: string;
  limit?: number;
}

/** Semantic product search restricted to public fields. */
export async function searchProducts(args: SearchArgs): Promise<AssistantProduct[]> {
  const limit = Math.min(Math.max(args.limit ?? 4, 1), 8);

  const where: Record<string, unknown> = { status: 'ACTIVE' };
  if (args.minPrice != null || args.maxPrice != null) {
    where.minListPrice = {
      ...(args.minPrice != null ? { gte: args.minPrice } : {}),
      ...(args.maxPrice != null ? { lte: args.maxPrice } : {}),
    };
  }
  if (args.department) {
    // Products hang off subcategories, so a department must match its children.
    const dept = await prisma.category.findUnique({
      where: { slug: args.department },
      select: { id: true, children: { select: { id: true } } },
    });
    if (dept) {
      const ids = dept.children.length ? dept.children.map((c) => c.id) : [dept.id];
      where.categoryId = { in: ids };
    }
  }

  const vector = await embedQuery(args.query);
  let ids: string[] | undefined;

  if (vector) {
    // Narrow the vector search to the filtered set only when filters are
    // selective enough that an IN list is cheaper than post-filtering.
    const filtered = Object.keys(where).length > 1;
    if (filtered) {
      const count = await prisma.product.count({ where: where as never });
      if (count === 0) return [];
      if (count <= 600) {
        const rows = await prisma.product.findMany({
          where: where as never,
          select: { id: true },
          take: 600,
        });
        ids = rows.map((r) => r.id);
      }
    }
    const hits = await semanticSearch(vector, { limit: limit * 3, ids });
    if (hits.length) {
      const rows = await prisma.product.findMany({
        where: { AND: [where as never, { id: { in: hits.map((h) => h.id) } }] } as never,
        select: PUBLIC_PRODUCT_SELECT,
        take: limit,
      });
      const rank = new Map(hits.map((h, i) => [h.id, i]));
      rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
      return rows.map(toAssistantProduct);
    }
  }

  // Keyword fallback — AI down, or nothing embedded yet.
  const rows = await prisma.product.findMany({
    where: {
      AND: [
        where as never,
        {
          OR: [
            { title: { contains: args.query, mode: 'insensitive' } },
            { brand: { contains: args.query, mode: 'insensitive' } },
          ],
        },
      ],
    } as never,
    orderBy: [{ reviewCount: 'desc' }],
    take: limit,
    select: PUBLIC_PRODUCT_SELECT,
  });
  return rows.map(toAssistantProduct);
}

/** NOTE: no `variants.minPrice`. Ever. */
const PUBLIC_PRODUCT_SELECT = {
  id: true,
  slug: true,
  title: true,
  brand: true,
  rating: true,
  reviewCount: true,
  minListPrice: true,
  images: { take: 1, orderBy: { position: 'asc' as const }, select: { url: true } },
  seller: { select: { storeName: true } },
  category: { select: { name: true, parent: { select: { name: true } } } },
};

type PublicProductRow = {
  slug: string;
  title: string;
  brand: string | null;
  rating: number;
  reviewCount: number;
  minListPrice: unknown;
  images: Array<{ url: string }>;
  seller: { storeName: string };
  category: { name: string; parent: { name: string } | null } | null;
};

function toAssistantProduct(p: PublicProductRow): AssistantProduct {
  return {
    slug: p.slug,
    title: p.title,
    brand: p.brand,
    price: num(p.minListPrice),
    rating: p.rating,
    reviewCount: p.reviewCount,
    imageUrl: p.images[0]?.url ?? null,
    seller: p.seller.storeName,
    department: p.category?.parent?.name ?? p.category?.name ?? null,
  };
}

export async function getProduct(slug: string) {
  const p = await prisma.product.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      brand: true,
      description: true,
      rating: true,
      reviewCount: true,
      category: { select: { name: true } },
      seller: { select: { storeName: true } },
      images: { take: 1, orderBy: { position: 'asc' }, select: { url: true } },
      // Public variant fields only — minPrice is deliberately absent.
      variants: {
        select: { id: true, sku: true, attrs: true, stock: true, listPrice: true },
      },
    },
  });
  if (!p) return { error: 'No product with that slug.' };

  return {
    slug: p.slug,
    title: p.title,
    brand: p.brand,
    description: p.description,
    rating: p.rating,
    reviewCount: p.reviewCount,
    category: p.category?.name ?? null,
    seller: p.seller.storeName,
    imageUrl: p.images[0]?.url ?? null,
    variants: p.variants.map((v) => ({
      variantId: v.id,
      attrs: v.attrs,
      inStock: v.stock > 0,
      stock: v.stock,
      price: num(v.listPrice),
    })),
  };
}

/**
 * Add to cart on the buyer's behalf.
 *
 * Mirrors the guards in the cart router rather than trusting the model: a
 * hallucinated variantId or an out-of-stock pick must fail loudly, and the
 * failure is fed back so the assistant can correct itself.
 */
export async function addToCart(userId: string, variantId: string, qty = 1): Promise<{ ok: true; action: CartAction } | { ok: false; error: string }> {
  const q = Math.min(Math.max(Math.round(qty || 1), 1), 10);

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true, stock: true, listPrice: true, product: { select: { title: true, status: true } } },
  });
  if (!variant) return { ok: false, error: 'That variant does not exist. Call get_product for valid variant ids.' };
  if (variant.product.status !== 'ACTIVE') return { ok: false, error: 'That product is not available.' };
  if (variant.stock < q) return { ok: false, error: `Only ${variant.stock} left in stock.` };

  const cart = await prisma.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
    select: { id: true },
  });

  await prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
    update: { qty: { increment: q } },
    create: { cartId: cart.id, variantId, qty: q },
  });

  return {
    ok: true,
    action: { variantId, qty: q, title: variant.product.title, price: num(variant.listPrice) },
  };
}
