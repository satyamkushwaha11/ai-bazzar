'use client';
import * as React from 'react';
import { Sparkles, Send, X, Tag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatINR, cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc/client';
import { ChatMarkdown } from './ChatMarkdown';

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  variantId: string;
  productTitle: string;
  storeName: string;
  listPrice: number;
  onLocked?: (offerId: string, price: number) => void;
}

interface Msg {
  role: 'buyer' | 'shopkeeper';
  text: string;
  pending?: boolean;
}

export function NegotiationChat({ open, onOpenChange, variantId, productTitle, storeName, listPrice, onLocked }: Props) {
  const start = trpc.negotiation.start.useMutation();
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState('');
  const [offer, setOffer] = React.useState('');
  /** Units the buyer wants. Sent every turn — it unlocks volume pricing. */
  const [qty, setQty] = React.useState(1);
  const [streaming, setStreaming] = React.useState(false);
  const [locked, setLocked] = React.useState<{ offerId: string; price: number; expiresAt: string } | null>(null);
  const [turn, setTurn] = React.useState<{ n: number; max: number } | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  /*
   * Live engine quote for the chosen quantity.
   *
   * Deliberately decoupled from the chat turn: pricing is deterministic and
   * costs one round trip, while writing a sentence about it costs seconds.
   * Tying them together made the qty control feel dead — you changed it and
   * nothing moved until the whole reply finished streaming.
   */
  const quote = trpc.negotiation.quote.useQuery(
    { sessionId: sessionId!, qty },
    { enabled: !!sessionId && !locked, staleTime: 15_000 },
  );

  React.useEffect(() => {
    if (!open) return;
    if (sessionId) return;
    start
      .mutateAsync({ variantId })
      .then((r) => {
        setSessionId(r.sessionId);
        setMessages([
          {
            role: 'shopkeeper',
            text: `Welcome! I'm the AI shopkeeper for ${storeName}. Make me an offer for the ${productTitle} (listed at ${formatINR(listPrice)}).`,
          },
        ]);
      })
      .catch((e) => toast.error(e.message ?? 'Could not start session'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  async function send() {
    if (!sessionId || streaming || locked) return;
    const text = input.trim();
    if (!text) return;
    const buyerOffer = offer.trim() ? Number(offer) : null;
    setInput('');
    setOffer('');
    setMessages((m) => [...m, { role: 'buyer', text }, { role: 'shopkeeper', text: '', pending: true }]);
    setStreaming(true);

    try {
      const res = await fetch('/api/ai/negotiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text, buyerOffer, qty }),
      });
      if (!res.ok || !res.body) throw new Error('Stream failed');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const e of events) {
          const lines = e.split('\n');
          const ev = lines.find((l) => l.startsWith('event:'))?.slice(7).trim() ?? 'message';
          const dataLine = lines.find((l) => l.startsWith('data:'))?.slice(5).trim() ?? '{}';
          let data: Record<string, unknown> = {};
          try { data = JSON.parse(dataLine); } catch {}
          if (ev === 'engine') setTurn({ n: data.turn as number, max: data.maxTurns as number });
          if (ev === 'chunk') {
            acc += (data.text as string) ?? '';
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = { role: 'shopkeeper', text: acc };
              return copy;
            });
          }
          if (ev === 'locked') {
            const offerId = data.offerId as string;
            const price = data.price as number;
            const expiresAt = data.expiresAt as string;
            setLocked({ offerId, price, expiresAt });
            onLocked?.(offerId, price);
          }
          if (ev === 'error') toast.error((data.message as string) ?? 'AI error');
        }
      }
    } catch (e) {
      toast.error('Something went wrong');
      setMessages((m) => m.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  }

  const addToCart = trpc.cart.add.useMutation({
    onSuccess: () => {
      utils.cart.get.invalidate();
      toast.success('Added to cart at locked price');
      onOpenChange(false);
    },
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-end bg-black/40 sm:place-items-center p-0 sm:p-4"
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-[80vh] w-full max-w-md flex-col rounded-t-xl border border-border bg-card shadow-pop sm:h-[600px] sm:rounded-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-fg text-[11px] font-bold text-bg">
                  B
                </div>
                <div>
                  <div className="text-sm font-medium leading-tight">{storeName}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" /> AI shopkeeper online
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {turn && <Badge variant="outline" className="text-[10px]">Turn {turn.n}/{turn.max}</Badge>}
                <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {messages.map((m, i) => (
                <div key={i} className={cn('flex', m.role === 'buyer' ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed',
                      m.role === 'buyer'
                        ? 'rounded-tr-sm bg-fg text-bg'
                        : 'rounded-tl-sm border border-border bg-bg',
                      m.pending && 'min-w-[40px]',
                    )}
                  >
                    {/* The shopkeeper bolds its prices; render that rather than
                        showing the buyer literal asterisks. */}
                    {m.text ? (
                      <ChatMarkdown text={m.text} />
                    ) : (
                      <span className="inline-flex gap-1">
                        <Dot delay="0s" />
                        <Dot delay=".15s" />
                        <Dot delay=".3s" />
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {locked && (
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Tag className="h-4 w-4 text-success" />
                    Locked at <span className="tabular text-base">{formatINR(locked.price)}</span>
                    {qty > 1 && <span className="text-xs font-normal text-muted-foreground">each × {qty}</span>}
                  </div>

                  {/*
                    Say plainly that the haggling is over. Leaving it ambiguous
                    invites the buyer to keep pushing a shopkeeper that has
                    already closed — which reads as the AI stonewalling them.
                  */}
                  <p className="mt-1 text-xs font-medium text-fg">
                    This is our final price — no further discount on this one.
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {locked.price < listPrice ? (
                      <>
                        You saved{' '}
                        <span className="tabular font-medium text-fg">
                          {formatINR((listPrice - locked.price) * qty)}
                        </span>{' '}
                        off list.{' '}
                      </>
                    ) : null}
                    Held for 10 minutes — add it to your cart to keep it.
                  </p>

                  <Button
                    className="mt-3 w-full"
                    onClick={() =>
                      // The negotiated qty, not 1: the price was agreed FOR this
                      // many units, so adding fewer would hand over a volume
                      // discount the buyer didn't earn.
                      addToCart.mutate({ variantId, qty, lockedOfferId: locked.offerId })
                    }
                    disabled={addToCart.isPending}
                  >
                    {addToCart.isPending
                      ? 'Adding…'
                      : qty > 1
                        ? `Add ${qty} to cart at ${formatINR(locked.price)} each`
                        : `Add to cart at ${formatINR(locked.price)}`}
                  </Button>
                </motion.div>
              )}
            </div>

            {/* Composer */}
            {!locked && (
              <div className="border-t border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {/*
                    Quantity is a negotiating lever, not just a cart field: more
                    units unlock real volume pricing from the engine. Putting it
                    in the composer is what makes that discoverable.
                  */}
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    Qty
                    <select
                      value={qty}
                      onChange={(e) => setQty(Number(e.target.value))}
                      aria-label="How many you want"
                      className="tabular h-9 rounded-md border border-input bg-bg px-1.5 text-sm text-fg focus-visible:border-fg focus-visible:outline-none"
                    >
                      {[1, 2, 3, 4, 5, 10].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                    <Input
                      value={offer}
                      onChange={(e) => setOffer(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="offer"
                      aria-label="Your offer per unit"
                      className="tabular h-9 w-20 pl-5 text-sm"
                    />
                  </div>
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && send()}
                    placeholder='e.g. "free shipping?"'
                    className="h-9 min-w-0 flex-1 text-sm"
                  />
                  <Button size="icon" className="h-9 w-9 shrink-0" onClick={send} disabled={streaming}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                {/*
                  Instant feedback on the qty lever: the engine's real number,
                  and what the next tier would actually save. Both come from the
                  engine, so the figures here always match what the shopkeeper
                  will quote.
                */}
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {quote.data ? (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>
                        Shopkeeper&rsquo;s price for {qty}:{' '}
                        <span className="tabular font-medium text-fg">
                          {formatINR(quote.data.unitPrice)}
                        </span>
                        {qty > 1 && <span className="tabular"> each · {formatINR(quote.data.total)} total</span>}
                      </span>
                      {quote.data.nextTier && quote.data.savePerUnitAtNextTier ? (
                        <button
                          onClick={() => setQty(quote.data!.nextTier!)}
                          className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-fg transition-colors hover:bg-muted"
                        >
                          Take {quote.data.nextTier} → save{' '}
                          {formatINR(quote.data.savePerUnitAtNextTier)}/each
                        </button>
                      ) : null}
                    </span>
                  ) : (
                    'Tip: a polite ask + a fair offer wins more deals than a low-ball.'
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-fg/60"
      style={{ animationDelay: delay }}
    />
  );
}
