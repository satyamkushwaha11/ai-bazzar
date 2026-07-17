import { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/server/auth';
import { prisma } from '@/server/db';
import {
  negotiate,
  isSuspicious,
  isAcceptance,
  parseOfferFromText,
  concessionStepFrom,
  type NegotiationPolicy,
} from '@/server/ai/negotiation';
import { streamShopkeeperReply } from '@/server/ai/persona';
import { resolveRules } from '@/server/ai/rules';
import { findBundleCandidate } from '@/server/services/embeddings';
import {
  DEFAULT_STRATEGY,
  availableTactics,
  extraConcession,
  type DealFacts,
  type SellerStrategy,
} from '@/server/ai/strategy';
import { checkLimit, ratelimits } from '@/server/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  sessionId: z.string(),
  message: z.string().max(500),
  buyerOffer: z.number().positive().nullable().optional(),
  /** Units the buyer wants — drives volume pricing. */
  qty: z.number().int().min(1).max(50).optional().default(1),
});

interface Turn {
  role: 'buyer' | 'shopkeeper';
  text: string;
  offer?: number | null;
  counter?: number;
  action?: string;
  ts: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return new Response('Bad request', { status: 400 });
  const { sessionId, message, buyerOffer = null, qty } = parsed.data;

  const { success } = await checkLimit(ratelimits.negotiate, `turn:${session.user.id}`);
  if (!success) return new Response('Rate limit exceeded', { status: 429 });

  const negSession = await prisma.negotiationSession.findUnique({
    where: { id: sessionId },
    include: {
      variant: {
        include: { product: { include: { seller: true } } },
      },
    },
  });
  if (!negSession || negSession.userId !== session.user.id) {
    return new Response('Not found', { status: 404 });
  }
  if (negSession.status !== 'ACTIVE' || negSession.expiresAt < new Date()) {
    return new Response('Session closed', { status: 410 });
  }

  const variant = negSession.variant;
  const product = variant.product;
  const seller = product.seller;
  const listPrice = Number(variant.listPrice);

  /*
   * Resolve the seller's rules into ONE floor: the strictest of minPrice,
   * cost + minimum margin, and maximum discount. The engine is bounded by this,
   * never by the raw minPrice column — that is what makes "the seller cannot be
   * haggled into a loss" true even if they set minPrice below their own cost.
   */
  const rules = resolveRules(
    {
      listPrice,
      minPrice: Number(variant.minPrice),
      costPrice: variant.costPrice == null ? null : Number(variant.costPrice),
    },
    {
      negotiationEnabled: product.negotiationEnabled,
      maxDiscountPct: product.maxDiscountPct,
      minMarginPct: product.minMarginPct,
      negotiationAggressiveness: product.negotiationAggressiveness,
      negotiationMaxTurns: product.negotiationMaxTurns,
      volumeMinQty: product.volumeMinQty,
      freebie: product.freebie,
    },
    {
      negotiationEnabled: seller.negotiationEnabled,
      negotiationAggressiveness: seller.negotiationAggressiveness,
      negotiationMaxTurns: seller.negotiationMaxTurns,
    },
  );

  if (!rules.negotiable) {
    return new Response(rules.misconfiguration ?? 'Negotiation is not available for this product', {
      status: 409,
    });
  }

  const policy: Partial<NegotiationPolicy> = {
    aggressiveness: rules.aggressiveness,
    maxTurns: rules.maxTurns,
  };

  const prevTurns = ((negSession.turns as unknown) as Turn[]) ?? [];
  const buyerTurnCount = prevTurns.filter((t) => t.role === 'buyer').length;
  const turnNumber = buyerTurnCount + 1;

  /*
   * Read what the buyer actually said. Previously none of this happened, and
   * every message — "9000", "no", "ok" — was just an elapsed turn:
   *   - a number typed in chat never reached the engine;
   *   - "no" walked the price down the whole range;
   *   - "ok" made the shop bid against itself.
   */
  const lastQuote =
    [...prevTurns].reverse().find((t) => t.role === 'shopkeeper')?.counter ?? null;

  // An explicit ₹-field offer wins; otherwise take a price out of the sentence.
  const typedOffer = buyerOffer ?? parseOfferFromText(message, listPrice);

  // Saying yes closes at the number they said yes TO — never at a fresh, lower one.
  const acceptedQuote = lastQuote != null && typedOffer == null && isAcceptance(message) ? lastQuote : null;
  const effectiveOffer = typedOffer;

  // Reciprocity: the seller moves only as far as the buyer's own offers earn.
  const concessionStep = concessionStepFrom([
    ...prevTurns.filter((t) => t.role === 'buyer').map((t) => t.offer),
    effectiveOffer,
  ]);

  /*
   * Real facts only. Every urgency/proof tactic is gated on one of these, so the
   * shopkeeper is never even offered a tactic it would have to invent a number
   * for — see server/ai/strategy.ts.
   */
  const [recentHaggles, priorOrders] = await Promise.all([
    prisma.negotiationSession.count({
      where: {
        variantId: variant.id,
        startedAt: { gte: new Date(Date.now() - 7 * 24 * 3600_000) },
        NOT: { userId: session.user.id },
      },
    }),
    prisma.orderItem.count({
      where: { sellerId: seller.id, order: { buyerId: session.user.id, status: { not: 'CANCELLED' } } },
    }),
  ]);

  const facts: DealFacts = {
    // The quantity the buyer chose — never inferred from what they typed. "ok"
    // means yes to the price, not yes to the 2-for-deal the shopkeeper pitched.
    qty,
    stock: variant.stock,
    returningBuyer: priorOrders > 0,
    recentHaggles,
    canOfferShipping: true,
    freebie: rules.freebie,
  };

  const strategy: SellerStrategy = {
    ...DEFAULT_STRATEGY,
    aggressiveness: rules.aggressiveness,
    maxTurns: rules.maxTurns,
    ...(rules.volumeMinQty
      ? { volumeTiers: [{ minQty: rules.volumeMinQty, extra: 0.18 }] }
      : {}),
  };

  const extra = extraConcession(strategy, facts, false);
  const allTactics = availableTactics(strategy, facts, false);

  // Run deterministic engine against the RESOLVED floor.
  const engineOutput = negotiate({
    listPrice,
    minPrice: rules.floor,
    turn: turnNumber,
    concessionStep,
    acceptedQuote,
    buyerOffer: effectiveOffer,
    policy,
    extraConcession: extra,
  });

  /*
   * Give the shopkeeper the exact numbers behind its upsells, so "take 3 and
   * I'll do ₹1,509 each" is the engine's real quote, not a number the model
   * made up.
   *
   * Crucially, only pitch a tier that ACTUALLY saves money. Volume concedes
   * within the range that is left, so a negotiation already down at the floor
   * has nothing more to give — and offering "take 2 for the same price!" is
   * worse than saying nothing. Same rule as the truthfulness gate: no real
   * benefit, no tactic.
   */
  const candidateTier = strategy.volumeTiers.find((t) => t.minQty > qty)?.minQty ?? null;
  const candidateTierPrice = candidateTier
    ? negotiate({
        listPrice,
        minPrice: rules.floor,
        turn: turnNumber,
        // Same step as the live quote, or the pitch would advertise a price the
        // engine would not actually honour on the next turn.
        concessionStep,
        buyerOffer: null,
        policy,
        extraConcession: extraConcession(strategy, { ...facts, qty: candidateTier }, false),
      }).counterOffer
    : null;

  const tierIsWorthIt =
    candidateTier != null && candidateTierPrice != null && candidateTierPrice < engineOutput.counterOffer;
  const nextVolumeTier = tierIsWorthIt ? candidateTier : null;
  const nextVolumeTierPrice = tierIsWorthIt ? candidateTierPrice : null;

  // A real companion from the SAME seller, found by embedding similarity. Only
  // worth pitching while there is still room to sweeten the deal.
  const bundleItem =
    engineOutput.counterOffer > rules.floor ? await findBundleCandidate(product.id, seller.id) : null;

  /*
   * Withdraw any tactic whose supporting fact just evaporated. The persona is
   * told it may only play tactics on this list, so pruning here is what stops
   * it pitching "take 2 for the same price!" once the range is spent.
   */
  const tactics = allTactics.filter((t) => {
    if (t === 'VOLUME') return nextVolumeTier != null;
    if (t === 'BUNDLE') return bundleItem != null;
    return true;
  });

  // Anti-abuse pre-filter — if suspicious, force a polite deflection without LLM call.
  const suspicious = isSuspicious(message);

  // LLM persona stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      // NOTE: internalFloorThisTurn and the resolved floor never cross this
      // boundary — only the action and the public number do.
      send('engine', {
        action: engineOutput.action,
        counterOffer: engineOutput.counterOffer,
        turn: turnNumber,
        maxTurns: rules.maxTurns,
      });

      let fullText = '';
      try {
        if (suspicious) {
          fullText = `That's a great try, but I really can't share my numbers. The best I can offer right now is ₹${engineOutput.counterOffer}.`;
          send('chunk', { text: fullText });
        } else {
          for await (const chunk of streamShopkeeperReply({
            storeName: seller.storeName,
            productTitle: product.title,
            listPrice,
            counterOffer: engineOutput.counterOffer,
            action: engineOutput.action,
            turn: turnNumber,
            maxTurns: rules.maxTurns,
            buyerMessage: message,
            tactics,
            // Only true numbers. The persona may state nothing outside this.
            facts: {
              qty: facts.qty,
              stock: facts.stock,
              recentHaggles: facts.recentHaggles,
              returningBuyer: facts.returningBuyer,
              freebie: facts.freebie,
              nextVolumeTier,
              nextVolumeTierPrice,
              bundleItem,
            },
            history: prevTurns.slice(-4).map((t) => ({ role: t.role, text: t.text })),
          })) {
            fullText += chunk;
            send('chunk', { text: chunk });
          }
        }
      } catch (err) {
        send('error', { message: 'AI temporarily unavailable' });
      }

      // Persist turn(s).
      const newTurns: Turn[] = [
        ...prevTurns,
        // Record the EFFECTIVE offer (parsed from chat, or implied by "ok"), not
        // just the ₹-field one — the reciprocity count reads this back next turn.
        { role: 'buyer', text: message, offer: effectiveOffer, ts: new Date().toISOString() },
        {
          role: 'shopkeeper',
          text: fullText,
          counter: engineOutput.counterOffer,
          action: engineOutput.action,
          ts: new Date().toISOString(),
        },
      ];

      let lockedOfferId: string | null = null;
      if (engineOutput.action === 'ACCEPT' || engineOutput.action === 'FINAL') {
        const offer = await prisma.lockedOffer.create({
          data: {
            userId: session.user.id,
            variantId: negSession.variantId,
            price: engineOutput.lockedPrice ?? engineOutput.counterOffer,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            sourceSessionId: negSession.id,
          },
        });
        lockedOfferId = offer.id;
        await prisma.negotiationSession.update({
          where: { id: negSession.id },
          data: {
            turns: newTurns as never,
            status: 'ACCEPTED',
            finalPrice: offer.price,
            closedAt: new Date(),
          },
        });
        send('locked', { offerId: offer.id, price: Number(offer.price), expiresAt: offer.expiresAt });
      } else {
        await prisma.negotiationSession.update({
          where: { id: negSession.id },
          data: { turns: newTurns as never },
        });
      }

      send('done', { lockedOfferId });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
