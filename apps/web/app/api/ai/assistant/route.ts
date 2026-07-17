import { NextRequest } from 'next/server';
import { z } from 'zod';
import type OpenAI from 'openai';
import { auth } from '@/server/auth';
import { openai, MODEL } from '@/server/ai/client';
import { checkLimit, ratelimits } from '@/server/redis';
import {
  SYSTEM_PROMPT,
  TOOLS,
  addToCart,
  getProduct,
  searchProducts,
  type AssistantProduct,
  type CartAction,
} from '@/server/ai/assistant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Hard stop on the agent loop — a model that keeps calling tools must not spin. */
const MAX_STEPS = 5;

const bodySchema = z.object({
  message: z.string().min(1).max(500),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(12)
    .optional()
    .default([]),
});

export async function POST(req: NextRequest) {
  const session = await auth();

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response('Bad request', { status: 400 });
  const { message, history } = parsed.data;

  // Browsing is open to anyone; only cart writes need an account. Anonymous
  // users share a key per IP, so the limiter still bounds an unauthenticated
  // flood — each turn can fan out to several model calls.
  const userId = session?.user?.id ?? null;
  const rateKey = userId ?? req.headers.get('x-forwarded-for') ?? 'anon';
  const { success } = await checkLimit(ratelimits.ai, `assistant:${rateKey}`);
  if (!success) return new Response('Rate limit exceeded', { status: 429 });

  if (!openai) return new Response('AI is not configured', { status: 503 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history.map((h) => ({ role: h.role, content: h.content }) as const),
        { role: 'user', content: message },
      ];

      // Products surfaced this turn, so the client can render real cards rather
      // than parsing them back out of the model's prose.
      const shown: AssistantProduct[] = [];
      const cartActions: CartAction[] = [];

      try {
        for (let step = 0; step < MAX_STEPS; step += 1) {
          const isLastStep = step === MAX_STEPS - 1;

          const res = await openai!.chat.completions.create({
            model: MODEL,
            temperature: 0.4,
            max_tokens: 400,
            messages,
            // On the final step force prose, or the loop could end on a tool call
            // and the buyer would see nothing at all.
            tools: isLastStep ? undefined : TOOLS,
            tool_choice: isLastStep ? undefined : 'auto',
          });

          const choice = res.choices[0]?.message;
          if (!choice) break;

          const calls = choice.tool_calls ?? [];
          if (calls.length === 0) {
            // Model is done reasoning — stream its answer out.
            const text = choice.content ?? '';
            if (text) send('chunk', { text });
            break;
          }

          messages.push(choice);

          for (const call of calls) {
            if (call.type !== 'function') continue;
            const { name } = call.function;
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(call.function.arguments || '{}');
            } catch {
              /* fall through to the error result below */
            }

            send('tool', { name });
            const result = await runTool(name, args, userId, shown, cartActions);

            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify(result),
            });
          }
        }

        if (shown.length) send('products', { products: shown });
        for (const a of cartActions) send('cart', a);
      } catch (err) {
        console.error('[assistant]', err);
        send('error', { message: 'The assistant is unavailable right now.' });
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

async function runTool(
  name: string,
  args: Record<string, unknown>,
  userId: string | null,
  shown: AssistantProduct[],
  cartActions: CartAction[],
): Promise<unknown> {
  switch (name) {
    case 'search_products': {
      const products = await searchProducts({
        query: String(args.query ?? ''),
        minPrice: typeof args.minPrice === 'number' ? args.minPrice : undefined,
        maxPrice: typeof args.maxPrice === 'number' ? args.maxPrice : undefined,
        department: typeof args.department === 'string' ? args.department : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      });
      for (const p of products) if (!shown.some((s) => s.slug === p.slug)) shown.push(p);
      return products.length ? products : { note: 'No matches. Suggest a broader search.' };
    }

    case 'get_product':
      return getProduct(String(args.slug ?? ''));

    case 'add_to_cart': {
      if (!userId) {
        return { error: 'The buyer is not signed in. Ask them to sign in first — do not retry.' };
      }
      const out = await addToCart(
        userId,
        String(args.variantId ?? ''),
        typeof args.qty === 'number' ? args.qty : 1,
      );
      if (out.ok) {
        cartActions.push(out.action);
        return { ok: true, added: out.action.title, qty: out.action.qty };
      }
      return { error: out.error };
    }

    default:
      return { error: `Unknown tool ${name}` };
  }
}
