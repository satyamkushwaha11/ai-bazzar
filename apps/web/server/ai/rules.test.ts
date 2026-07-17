import { describe, expect, it } from 'vitest';
import { resolveRules, profitOf, type ProductRules, type SellerDefaults } from './rules';
import { negotiate } from './negotiation';

const SELLER: SellerDefaults = {
  negotiationEnabled: true,
  negotiationAggressiveness: 0.5,
  negotiationMaxTurns: 4,
};

const NO_RULES: ProductRules = {
  negotiationEnabled: null,
  maxDiscountPct: null,
  minMarginPct: null,
  negotiationAggressiveness: null,
  negotiationMaxTurns: null,
  volumeMinQty: null,
  freebie: null,
};

describe('resolveRules', () => {
  it('falls back to minPrice when nothing else is configured', () => {
    const r = resolveRules({ listPrice: 1500, minPrice: 800, costPrice: null }, NO_RULES, SELLER);
    expect(r.floor).toBe(800);
    expect(r.binding).toBe('minPrice');
    expect(r.negotiable).toBe(true);
  });

  it('takes the STRICTEST constraint, not the most generous', () => {
    // minPrice 800 | cost 700 +20% = 840 | max 30% off 1500 = 1050  ->  1050 wins
    const r = resolveRules(
      { listPrice: 1500, minPrice: 800, costPrice: 700 },
      { ...NO_RULES, minMarginPct: 20, maxDiscountPct: 30 },
      SELLER,
    );
    expect(r.floor).toBe(1050);
    expect(r.binding).toBe('maxDiscount');
  });

  it('the profit floor binds even when minPrice was set below cost', () => {
    // A seller fat-fingers minPrice to 100 on an item that costs them 700.
    const r = resolveRules(
      { listPrice: 1500, minPrice: 100, costPrice: 700 },
      { ...NO_RULES, minMarginPct: 25 },
      SELLER,
    );
    expect(r.floor).toBe(875); // 700 * 1.25
    expect(r.binding).toBe('profitFloor');
  });

  it('never sells below cost even when no margin is stated', () => {
    const r = resolveRules(
      { listPrice: 1500, minPrice: 200, costPrice: 900 },
      NO_RULES,
      SELLER,
    );
    expect(r.floor).toBe(900);
    expect(r.binding).toBe('profitFloor');
  });

  it('disables negotiation and explains when the rules are impossible', () => {
    const r = resolveRules(
      { listPrice: 1000, minPrice: 500, costPrice: 1200 },
      { ...NO_RULES, minMarginPct: 10 },
      SELLER,
    );
    expect(r.negotiable).toBe(false);
    expect(r.misconfiguration).toContain('above your list price');
  });

  it('honours a per-product negotiation switch over the seller default', () => {
    const off = resolveRules(
      { listPrice: 1500, minPrice: 800, costPrice: null },
      { ...NO_RULES, negotiationEnabled: false },
      SELLER,
    );
    expect(off.negotiable).toBe(false);

    const on = resolveRules(
      { listPrice: 1500, minPrice: 800, costPrice: null },
      { ...NO_RULES, negotiationEnabled: true },
      { ...SELLER, negotiationEnabled: false },
    );
    expect(on.negotiable).toBe(true);
  });

  it('per-product pace overrides the seller default', () => {
    const r = resolveRules({ listPrice: 1500, minPrice: 800, costPrice: null },
      { ...NO_RULES, negotiationAggressiveness: 0.9, negotiationMaxTurns: 6 }, SELLER);
    expect(r.aggressiveness).toBe(0.9);
    expect(r.maxTurns).toBe(6);
  });
});

describe('the seller cannot be haggled into a loss', () => {
  /** Deterministic pseudo-random seller configs — no flaky property tests. */
  function* configs(n: number) {
    let seed = 7;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < n; i += 1) {
      const list = 200 + Math.floor(next() * 20_000);
      const cost = Math.round(list * (0.2 + next() * 0.5));
      yield {
        variant: {
          listPrice: list,
          // Deliberately hostile: minPrice is often set BELOW cost here.
          minPrice: Math.max(10, Math.round(list * (0.1 + next() * 0.6))),
          costPrice: cost,
        },
        rules: {
          ...NO_RULES,
          minMarginPct: next() < 0.6 ? Math.round(next() * 40) : null,
          maxDiscountPct: next() < 0.5 ? Math.round(10 + next() * 60) : null,
        },
      };
    }
  }

  it('never quotes below cost + minimum margin, across turns, offers and tactics', () => {
    for (const { variant, rules } of configs(400)) {
      const r = resolveRules(variant, rules, SELLER);
      if (!r.negotiable) continue;

      for (let turn = 1; turn <= r.maxTurns; turn += 1) {
        // Sweep buyer offers, including insulting ones, plus stacked tactics.
        for (const offer of [null, 1, variant.listPrice * 0.3, r.floor - 1, r.floor, variant.listPrice]) {
          for (const extra of [0, 0.2, 0.6, 5]) {
            const out = negotiate({
              listPrice: variant.listPrice,
              minPrice: r.floor, // the engine is bounded by the RESOLVED floor
              turn,
              buyerOffer: offer,
              policy: { aggressiveness: r.aggressiveness, maxTurns: r.maxTurns },
              extraConcession: extra,
            });

            expect(out.counterOffer).toBeGreaterThanOrEqual(Math.floor(r.floor) - 1);
            if (variant.costPrice != null) {
              // The point of the whole exercise: never below cost.
              expect(out.counterOffer).toBeGreaterThanOrEqual(Math.floor(variant.costPrice) - 1);
            }
          }
        }
      }
    }
  });

  it('a stack of tactics lands ON the floor, never through it', () => {
    const r = resolveRules(
      { listPrice: 2000, minPrice: 1200, costPrice: 1000 },
      { ...NO_RULES, minMarginPct: 10 },
      SELLER,
    );
    const out = negotiate({
      listPrice: 2000,
      minPrice: r.floor,
      turn: 4,
      buyerOffer: 1,
      policy: { aggressiveness: 1, maxTurns: 4 },
      extraConcession: 99, // absurd: every tactic at once
    });
    expect(out.counterOffer).toBeGreaterThanOrEqual(r.floor - 1);
  });
});

describe('win-win economics', () => {
  it('volume lets the unit price fall while total profit rises', () => {
    const list = 1000;
    const cost = 600;
    const r = resolveRules({ listPrice: list, minPrice: 700, costPrice: cost }, NO_RULES, SELLER);

    const single = negotiate({
      listPrice: list, minPrice: r.floor, turn: 2, buyerOffer: null,
      policy: { aggressiveness: 0.5, maxTurns: 4 }, extraConcession: 0,
    });
    const bulk = negotiate({
      listPrice: list, minPrice: r.floor, turn: 2, buyerOffer: null,
      policy: { aggressiveness: 0.5, maxTurns: 4 }, extraConcession: 0.22, // 3+ tier
    });

    // Buyer wins: cheaper per unit.
    expect(bulk.counterOffer).toBeLessThan(single.counterOffer);
    // Seller wins: more absolute profit on 3 units than on 1 at the higher price.
    const p1 = profitOf(single.counterOffer, 1, cost)!;
    const p3 = profitOf(bulk.counterOffer, 3, cost)!;
    expect(p3).toBeGreaterThan(p1);
    // And still above cost.
    expect(bulk.counterOffer).toBeGreaterThan(cost);
  });

  it('profitOf refuses to guess when cost is unknown', () => {
    expect(profitOf(500, 2, null)).toBeNull();
  });
});
