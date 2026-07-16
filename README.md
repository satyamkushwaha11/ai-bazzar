# Bazaar — AI multi-vendor ecommerce

A full-stack multi-vendor marketplace where buyers can **chat down the price** with an AI shopkeeper.
Sellers set a private floor (`minPrice`) and a public list price; the AI haggles within that band.

## What's in the box

- **Storefront**: home, categories, product detail (gallery, variants, reviews), AI search, wishlist, cart, checkout (Razorpay), order history.
- **AI negotiation chat**: streaming SSE conversation, deterministic pricing engine + LLM persona, locked-offer flow with 10-min expiry.
- **Seller dashboard**: product CRUD with min/list pricing per variant, order management, analytics, negotiation policy.
- **Admin dashboard**: seller approval, users, orders, categories, platform stats.
- **Auth**: Auth.js v5 (credentials + Google), role-based middleware (BUYER / SELLER / ADMIN).
- **Type-safe API**: tRPC v11 + Zod, shared with the React client.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui · tRPC v11 · Prisma 6 · PostgreSQL (Neon) · Auth.js v5 · Razorpay · OpenAI (gpt-4o-mini) · Upstash Redis · Resend · Vitest + Playwright · pnpm + Turborepo · Vercel.

## Quickstart

```bash
# 1. Install
corepack enable
pnpm install

# 2. Configure env
cp .env.example .env
#   Fill DATABASE_URL (Neon), AUTH_SECRET (`openssl rand -base64 32`),
#   OPENAI_API_KEY, RAZORPAY_* (test mode), UPSTASH_REDIS_REST_*

# 3. Database
pnpm db:push           # apply schema to Neon
pnpm db:seed           # demo users, sellers, categories, products

# 4. Run
pnpm dev               # → http://localhost:3000
```

### Demo accounts (after seed)

| Role   | Email                | Password      |
|--------|----------------------|---------------|
| Admin  | admin@bazaar.dev     | admin12345    |
| Buyer  | buyer@bazaar.dev     | buyer12345    |
| Seller | shoes@bazaar.dev     | seller12345   |

### Optional services

- Without **OPENAI_API_KEY**: AI chat falls back to canned shopkeeper replies (engine still works).
- Without **RAZORPAY_***: checkout switches to a "stub mode" that marks orders PAID immediately so you can test the flow end-to-end.
- Without **UPSTASH_REDIS_***: rate limiting becomes a no-op (fine for local dev).

## The negotiation engine (the core IP)

Two strict layers:

### 1. Deterministic pricing engine — [apps/web/server/ai/negotiation.ts](apps/web/server/ai/negotiation.ts)

Pure TypeScript. Computes the next price using a concession curve that starts near `listPrice` and asymptotes toward `minPrice` over `maxTurns`. Returns `{ action: COUNTER|ACCEPT|FINAL, counterOffer }`.

**Invariants (proven by [negotiation.test.ts](apps/web/server/ai/negotiation.test.ts)):**
- Engine **never** quotes below `minPrice`.
- Floor monotonically concedes across turns.
- ACCEPT only fires when the buyer offer ≥ engine's floor for that turn.

`minPrice` **never** leaves this module.

### 2. LLM persona layer — [apps/web/server/ai/persona.ts](apps/web/server/ai/persona.ts)

Receives only public context (title, listPrice, the engine's chosen `counterOffer`, buyer message, turn). Streams a warm shopkeeper reply that quotes the exact `counterOffer`. Uses OpenAI chat completions with streaming (gpt-4o-mini by default — cheap and fast).

### Streaming endpoint — [apps/web/app/api/ai/negotiate/route.ts](apps/web/app/api/ai/negotiate/route.ts)

SSE stream emitting `engine`, `chunk`, `locked`, `done` events. On ACCEPT/FINAL it creates a `LockedOffer` row valid 10 min, which the cart references via `lockedOfferId`.

## Project layout

```
apps/web/                      # Next.js app
  app/
    (storefront)/              # public buyer routes
    (auth)/                    # login, signup
    seller/                    # seller dashboard (role-gated)
    admin/                     # admin dashboard (role-gated)
    api/
      trpc/[trpc]/route.ts
      auth/[...nextauth]/route.ts
      ai/negotiate/route.ts    # SSE
      webhooks/razorpay/route.ts
  server/
    ai/                        # negotiation, persona, search, client
    services/                  # pricing, razorpay, password
    trpc/                      # routers + context
    auth.ts
    db.ts
    redis.ts
  components/
    ui/                        # shadcn primitives
    storefront/                # Header, Footer, ProductCard, Logo
    dashboard/                 # Sidebar, PageHeader, StatCard
    ai/NegotiationChat.tsx     # SSE chat UI
  lib/                         # utils, trpc client + Provider
  styles/globals.css
  middleware.ts                # role-based route protection

packages/
  db/                          # Prisma schema, client, seed
  config/                      # tsconfig.base.json
```

## Useful commands

```bash
pnpm dev                # start web on :3000
pnpm build              # production build
pnpm lint               # next lint
pnpm typecheck          # tsc --noEmit across workspaces

pnpm db:push            # push schema (dev)
pnpm db:migrate         # create migration
pnpm db:studio          # Prisma Studio
pnpm db:seed            # reseed demo data

pnpm --filter @app/web test   # vitest (negotiation engine)
```

## Deployment

1. **Database**: create a [Neon](https://neon.tech) project. Copy the pooled `DATABASE_URL` and direct `DIRECT_URL`.
2. **Redis**: create an [Upstash](https://upstash.com) Redis. Copy REST URL + token.
3. **Razorpay**: sign up, grab test keys + create a webhook secret pointing at `${APP_URL}/api/webhooks/razorpay`.
4. **OpenAI**: get an API key from platform.openai.com/api-keys.
5. **Vercel**:
   - Import the repo.
   - Set env vars from `.env.example`.
   - Build command: `pnpm turbo run build --filter=@app/web...`
   - Output dir: auto-detected.
   - Add a Postdeploy hook running `pnpm db:deploy` (or run `prisma migrate deploy` manually before first launch).

## Security notes (already wired)

- `minPrice` is **never** included in any tRPC select callable from the buyer client.
- Razorpay webhook signature verified with `RAZORPAY_WEBHOOK_SECRET`.
- Negotiation: per-user rate limits on Upstash; prompt-injection heuristic pre-filter.
- Sessions are JWT (Auth.js), cookies marked `httpOnly` + `sameSite`.
- Passwords stored as `scrypt$salt$hash` (timing-safe verify).

## Roadmap (deliberately out of MVP)

Returns/refunds workflow, mobile app, recommendations, advanced fraud rules, B2B pricing, gift cards, loyalty program, multi-currency, Meilisearch (pluggable behind `parseSearch`).

---

Built with [Claude](https://claude.ai/code).
# ai-bazzar
