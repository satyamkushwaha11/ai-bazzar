import { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/server/auth';
import { prisma } from '@/server/db';
import { negotiateBasket, listTotalOf } from '@/server/ai/basket';
import {
  isSuspicious,
  isAcceptance,
  parseOfferFromText,
  concessionStepFrom,
} from '@/server/ai/negotiation';
import { streamBasketReply } from '@/server/ai/basket-persona';
import { loadBasket, lockBasket } from '@/server/services/basket-negotiation';
import { checkLimit, ratelimits } from '@/server/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCK_MINUTES = 10;
const SESSION_MINUTES = 30;

const bodySchema = z.object({
  message: z.string().max(500).default(''),
  buyerOffer: z.number().positive().nullable().optional(),
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
  const userId = session.user.id;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response('Bad request', { status: 400 });
  const { message, buyerOffer = null } = parsed.data;

  const { success } = await checkLimit(ratelimits.negotiate, `basket:${userId}`);
  if (!success) return new Response('Rate limit exceeded', { status: 429 });

  /*
   * Floors are read live every turn and never from a stored row. Lines already
   * haggled on the product page enter at their LOCKED price, so this round can
   * only improve on what the buyer holds — see services/basket-negotiation.ts.
   */
  const basket = await loadBasket(userId);
  if (!basket) return new Response('Nothing negotiable in your cart', { status: 409 });

  let negotiation = await prisma.basketNegotiation.findFirst({
    where: { userId, cartId: basket.cartId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
  });
  if (!negotiation) {
    negotiation = await prisma.basketNegotiation.create({
      data: {
        userId,
        cartId: basket.cartId,
        listTotal: basket.lines.reduce((s, l) => s + l.listPrice * l.qty, 0),
        expiresAt: new Date(Date.now() + SESSION_MINUTES * 60_000),
      },
    });
  }

  const prevTurns = ((negotiation.turns as unknown) as Turn[]) ?? [];
  const turnNumber = prevTurns.filter((t) => t.role === 'buyer').length + 1;

  /*
   * Read what the buyer actually said — the same three fixes as the per-product
   * route. Without them "okya" was just another elapsed turn, and the shop
   * answered its own ₹45,572 quote with ₹40,196: bidding against itself.
   */
  const basketListTotal = listTotalOf(basket.lines);
  const lastQuote = [...prevTurns].reverse().find((t) => t.role === 'shopkeeper')?.counter ?? null;
  const typedOffer = buyerOffer ?? parseOfferFromText(message, basketListTotal);

  // Yes closes at the number they said yes TO, never at a fresh lower one.
  const acceptedQuote =
    lastQuote != null && typedOffer == null && isAcceptance(message) ? lastQuote : null;
  const effectiveOffer = typedOffer;

  // Reciprocity: refusals earn nothing; only real offers walk the curve.
  const concessionStep = concessionStepFrom([
    ...prevTurns.filter((t) => t.role === 'buyer').map((t) => t.offer),
    effectiveOffer,
  ]);

  const engine = negotiateBasket({
    lines: basket.lines,
    turn: turnNumber,
    concessionStep,
    acceptedQuote,
    buyerOffer: effectiveOffer,
    policy: basket.policy,
  });

  const suspicious = isSuspicious(message);
  const alreadyNegotiatedCount = basket.display.filter((d) => d.alreadyNegotiated).length;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      // NOTE: internalFloorThisTurn never crosses this boundary.
      send('engine', {
        action: engine.action,
        counterOffer: engine.counterOffer,
        listTotal: engine.listTotal,
        turn: turnNumber,
        maxTurns: basket.policy.maxTurns,
        alreadyNegotiated: alreadyNegotiatedCount,
      });

      let fullText = '';
      try {
        if (suspicious) {
          fullText = `Nice try, friend — I can't share my numbers. Best I can do for the basket is ₹${engine.counterOffer}.`;
          send('chunk', { text: fullText });
        } else {
          for await (const chunk of streamBasketReply({
            itemCount: basket.display.reduce((s, d) => s + d.qty, 0),
            sellerCount: basket.sellerCount,
            listTotal: engine.listTotal,
            counterOffer: engine.counterOffer,
            action: engine.action,
            turn: turnNumber,
            maxTurns: basket.policy.maxTurns,
            buyerMessage: message,
            sampleTitles: basket.display.map((d) => d.title),
            alreadyNegotiatedCount,
            noRoomLeft: engine.remainingRange <= 0,
            history: prevTurns.slice(-4).map((t) => ({ role: t.role, text: t.text })),
          })) {
            fullText += chunk;
            send('chunk', { text: chunk });
          }
        }
      } catch (err) {
        console.error('[negotiate-basket]', err);
        send('error', { message: 'AI temporarily unavailable' });
      }

      const newTurns: Turn[] = [
        ...prevTurns,
        // The EFFECTIVE offer — parsed from chat or implied by "ok". The
        // reciprocity count reads this back on the next turn.
        { role: 'buyer', text: message, offer: effectiveOffer, ts: new Date().toISOString() },
        {
          role: 'shopkeeper',
          text: fullText,
          counter: engine.counterOffer,
          action: engine.action,
          ts: new Date().toISOString(),
        },
      ];

      try {
        if ((engine.action === 'ACCEPT' || engine.action === 'FINAL') && engine.allocation) {
          const expiresAt = new Date(Date.now() + LOCK_MINUTES * 60_000);
          await lockBasket({
            userId,
            cartId: basket.cartId,
            basketId: negotiation!.id,
            allocation: engine.allocation,
            expiresAt,
          });
          await prisma.basketNegotiation.update({
            where: { id: negotiation!.id },
            data: {
              turns: newTurns as never,
              status: 'ACCEPTED',
              finalTotal: engine.counterOffer,
              closedAt: new Date(),
            },
          });
          send('locked', {
            total: engine.counterOffer,
            listTotal: engine.listTotal,
            saved: engine.listTotal - engine.counterOffer,
            expiresAt: expiresAt.toISOString(),
          });
        } else {
          await prisma.basketNegotiation.update({
            where: { id: negotiation!.id },
            data: { turns: newTurns as never },
          });
        }
      } catch (err) {
        console.error('[negotiate-basket] persist failed', err);
        send('error', { message: 'Could not lock that price. Try again.' });
      }

      send('done', {});
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
