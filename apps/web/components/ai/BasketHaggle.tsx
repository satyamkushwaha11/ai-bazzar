'use client';
import * as React from 'react';
import { MessageSquare, Send, Tag, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatINR, cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc/client';
import { ChatMarkdown } from './ChatMarkdown';

interface Msg {
  role: 'buyer' | 'shopkeeper';
  text: string;
  pending?: boolean;
}

interface Locked {
  total: number;
  listTotal: number;
  saved: number;
  expiresAt: string;
}

/**
 * The optional second haggle, over the whole basket at checkout.
 *
 * The engine owns every number: this component sends what the buyer typed and
 * renders what comes back. It never computes or proposes a price. Lines already
 * negotiated on the product page enter this round at their locked price, so a
 * second pass can only improve on what the buyer already holds.
 */
export function BasketHaggle({ listTotal, onLocked }: { listTotal: number; onLocked: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState('');
  const [offer, setOffer] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [locked, setLocked] = React.useState<Locked | null>(null);
  const [turn, setTurn] = React.useState<{ n: number; max: number } | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  React.useEffect(() => {
    if (!open || messages.length) return;
    setMessages([
      {
        role: 'shopkeeper',
        text: `You've got ${formatINR(listTotal)} of good stuff there. Make me an offer for the lot!`,
      },
    ]);
  }, [open, messages.length, listTotal]);

  async function send() {
    const text = input.trim();
    const buyerOffer = offer.trim() ? Number(offer) : null;
    if ((!text && !buyerOffer) || busy || locked) return;

    setInput('');
    setOffer('');
    setMessages((m) => [
      ...m,
      { role: 'buyer', text: text || `My offer: ${formatINR(buyerOffer!)}` },
      { role: 'shopkeeper', text: '', pending: true },
    ]);
    setBusy(true);

    try {
      const res = await fetch('/api/ai/negotiate-basket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, buyerOffer }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text().catch(() => 'Failed'));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';

      const patchLast = (patch: Partial<Msg>) =>
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { ...copy[copy.length - 1]!, ...patch };
          return copy;
        });

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const ev = frame.match(/^event: (.*)$/m)?.[1]?.trim() ?? 'message';
          const raw = frame.match(/^data: (.*)$/m)?.[1] ?? '{}';
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(raw);
          } catch {
            continue;
          }

          if (ev === 'engine') setTurn({ n: data.turn as number, max: data.maxTurns as number });
          if (ev === 'chunk') {
            acc += (data.text as string) ?? '';
            patchLast({ role: 'shopkeeper', text: acc, pending: false });
          }
          if (ev === 'locked') {
            setLocked(data as unknown as Locked);
            // Re-price from the server: locked lines now drive unitPrice, so the
            // total must come from priceCart, never from anything computed here.
            utils.order.preview.invalidate();
            utils.cart.get.invalidate();
            onLocked();
          }
          if (ev === 'error') toast.error((data.message as string) ?? 'AI error');
        }
      }
      patchLast({ pending: false });
    } catch (e) {
      toast.error(
        e instanceof Error && e.message.includes('negotiable')
          ? 'Nothing in your cart is negotiable.'
          : 'Something went wrong',
      );
      setMessages((m) => m.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  if (locked) {
    return (
      <div className="rounded-lg border border-success/30 bg-success/10 p-4">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <Tag className="h-4 w-4 text-success" />
          Basket locked at <span className="tabular text-base">{formatINR(locked.total)}</span>
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {locked.saved > 0 ? (
            <>
              You saved <span className="tabular font-medium text-fg">{formatINR(locked.saved)}</span> off{' '}
              {formatINR(locked.listTotal)}.{' '}
            </>
          ) : null}
          Your price holds for 10 minutes — the summary has updated.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="text-[13px] font-medium">Haggle over the whole basket</div>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              One more go at the total — even if you already negotiated some items individually.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="shrink-0">
            <MessageSquare className="h-4 w-4" /> Haggle
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[420px] flex-col rounded-lg border border-border">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-fg text-[10px] font-bold text-bg">
            B
          </span>
          <span className="text-[13px] font-medium">Haggling over your basket</span>
        </div>
        <div className="flex items-center gap-2">
          {turn && (
            <Badge variant="outline" className="text-[10px]">
              Turn {turn.n}/{turn.max}
            </Badge>
          )}
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-2.5">
        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'buyer' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed',
                m.role === 'buyer'
                  ? 'rounded-tr-sm bg-fg text-bg'
                  : 'rounded-tl-sm border border-border bg-bg',
              )}
            >
              {m.text ? <ChatMarkdown text={m.text} /> : <Dots />}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border p-2.5">
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
              ₹
            </span>
            <input
              value={offer}
              onChange={(e) => setOffer(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="offer"
              aria-label="Your offer for the basket"
              className="tabular h-8 w-20 rounded-md border border-input bg-bg pl-4 pr-1.5 text-[12px] focus-visible:border-fg focus-visible:outline-none"
            />
          </div>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder='e.g. "knock off ₹300 and it&apos;s a deal"'
            aria-label="Message the shopkeeper"
            className="h-8 flex-1 rounded-md border border-input bg-bg px-2.5 text-[12px] focus-visible:border-fg focus-visible:outline-none"
          />
          <Button size="icon" className="h-8 w-8 shrink-0" onClick={send} disabled={busy}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          A fair offer wins more deals than a low-ball.
        </p>
      </div>
    </div>
  );
}

function Dots() {
  return (
    <span className="inline-flex gap-1">
      {['0s', '.15s', '.3s'].map((d) => (
        <span
          key={d}
          className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
          style={{ animationDelay: d }}
        />
      ))}
    </span>
  );
}
