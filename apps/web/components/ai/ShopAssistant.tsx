'use client';
import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MessageSquare, Send, X, Star, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatINR, cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc/client';
import { ChatMarkdown } from './ChatMarkdown';

interface Product {
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

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  products?: Product[];
  pending?: boolean;
  /** Transient label while a tool runs ("Searching the catalogue…"). */
  tool?: string;
}

const TOOL_LABEL: Record<string, string> = {
  search_products: 'Searching the catalogue…',
  get_product: 'Checking the details…',
  add_to_cart: 'Adding to your cart…',
};

const SUGGESTIONS = [
  'something for my evening jog',
  'gift for someone who loves cooking',
  'keep my drinks cold on a hike',
  'a desk lamp under ₹2000',
];

export function ShopAssistant() {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');

    // Only prose goes back as history — product payloads would balloon the context.
    const history = messages
      .filter((m) => m.text)
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.text }));

    setMessages((m) => [...m, { role: 'user', text: q }, { role: 'assistant', text: '', pending: true }]);
    setBusy(true);

    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, history }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text().catch(() => 'Request failed'));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';
      let cartTouched = false;

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

          if (ev === 'tool') {
            patchLast({ tool: TOOL_LABEL[data.name as string] ?? 'Working…', pending: true });
          }
          if (ev === 'chunk') {
            acc += (data.text as string) ?? '';
            patchLast({ role: 'assistant', text: acc, pending: false, tool: undefined });
          }
          if (ev === 'products') {
            patchLast({ products: data.products as Product[], pending: false, tool: undefined });
          }
          if (ev === 'cart') {
            cartTouched = true;
            toast.success(`Added ${data.title as string} to cart`);
          }
          if (ev === 'error') {
            toast.error((data.message as string) ?? 'Assistant error');
            patchLast({ text: 'Sorry — I could not reach the catalogue just now.', pending: false, tool: undefined });
          }
        }
      }

      if (cartTouched) utils.cart.get.invalidate();
      patchLast({ pending: false, tool: undefined });
    } catch (e) {
      toast.error(e instanceof Error && e.message.includes('Rate') ? 'Slow down a moment.' : 'Something went wrong');
      setMessages((m) => m.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Launcher — below the negotiation modal's z-50 so it never covers it. */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open shopping assistant"
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-border bg-fg px-4 py-3 text-[13px] font-medium text-bg shadow-pop transition-transform hover:scale-[1.03]"
        >
          <MessageSquare className="h-4 w-4" />
          Ask the assistant
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-40 sm:inset-auto sm:bottom-4 sm:right-4">
          <div className="flex h-full flex-col border-border bg-bg sm:h-[560px] sm:w-[400px] sm:rounded-xl sm:border sm:shadow-pop">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-fg text-[11px] font-bold text-bg">
                  B
                </span>
                <div>
                  <div className="text-[13px] font-medium leading-tight">Shopping assistant</div>
                  <div className="text-[11px] text-muted-foreground">Finds things across the catalogue</div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </header>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {messages.length === 0 && (
                <div className="pt-6">
                  <p className="text-[13px] text-muted-foreground">
                    Describe what you need — in your own words. I&rsquo;ll search the whole catalogue.
                  </p>
                  <div className="mt-3 flex flex-col items-start gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="rounded-full border border-border px-2.5 py-1 text-left text-[12px] text-muted-foreground transition-colors hover:border-fg/40 hover:text-fg"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className="space-y-2">
                  <div className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed',
                        m.role === 'user'
                          ? 'rounded-tr-sm bg-fg text-bg'
                          : 'rounded-tl-sm border border-border bg-bg',
                      )}
                    >
                      {m.text ? (
                        <ChatMarkdown text={m.text} />
                      ) : (
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Dots />
                          {m.tool && <span className="text-[12px]">{m.tool}</span>}
                        </span>
                      )}
                    </div>
                  </div>

                  {m.products?.map((p) => (
                    <ProductRow key={p.slug} p={p} onNavigate={() => setOpen(false)} />
                  ))}
                </div>
              ))}
            </div>

            <div className="border-t border-border p-3">
              <div className="flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send(input)}
                  placeholder="What are you looking for?"
                  aria-label="Message the shopping assistant"
                  className="h-9 flex-1 rounded-md border border-input bg-bg px-3 text-[13px] transition-colors placeholder:text-muted-foreground focus-visible:border-fg focus-visible:outline-none"
                />
                <Button size="icon" className="h-9 w-9" onClick={() => send(input)} disabled={busy}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Every price is negotiable — haggle on the product page before you buy.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ProductRow({ p, onNavigate }: { p: Product; onNavigate: () => void }) {
  return (
    <Link
      href={`/p/${p.slug}`}
      onClick={onNavigate}
      className="flex gap-3 rounded-lg border border-border p-2 transition-colors hover:border-fg/25"
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded bg-muted">
        {p.imageUrl && <Image src={p.imageUrl} alt="" fill sizes="64px" className="object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        {p.brand && (
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{p.brand}</div>
        )}
        <div className="line-clamp-2 text-[12px] leading-snug">{p.title}</div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="tabular text-[13px] font-semibold">{formatINR(p.price)}</span>
          {p.reviewCount > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
              <Star className="h-2.5 w-2.5 fill-fg stroke-none" />
              <span className="tabular">{p.rating.toFixed(1)}</span>
            </span>
          )}
        </div>
      </div>
      <ShoppingBag className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </Link>
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
