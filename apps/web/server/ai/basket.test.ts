import { describe, expect, it } from 'vitest';
import { allocate, floorTotalOf, listTotalOf, negotiateBasket, type BasketLine } from './basket';

const line = (variantId: string, listPrice: number, minPrice: number, qty = 1): BasketLine => ({
  variantId,
  listPrice,
  minPrice,
  qty,
});

const BASKET: BasketLine[] = [
  line('shoes', 3899, 2600),
  line('lamp', 2501, 1900),
  line('jacket', 6000, 3500),
];

/** Deterministic pseudo-random baskets — property tests must not be flaky. */
function* randomBaskets(count: number): Generator<BasketLine[]> {
  let seed = 42;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < count; i += 1) {
    const n = 1 + Math.floor(next() * 5);
    const lines: BasketLine[] = [];
    for (let j = 0; j < n; j += 1) {
      const list = 100 + Math.floor(next() * 50_000);
      const min = Math.max(50, Math.round(list * (0.3 + next() * 0.6)));
      lines.push(line(`v${j}`, list, Math.min(min, list), 1 + Math.floor(next() * 4)));
    }
    yield lines;
  }
}

describe('allocate', () => {
  it("never prices any line below that line's own floor", () => {
    for (const lines of randomBaskets(300)) {
      const listTotal = listTotalOf(lines);
      const floorTotal = floorTotalOf(lines);
      for (const t of [0, 0.01, 0.25, 0.5, 0.75, 0.99, 1]) {
        const agreed = floorTotal + (listTotal - floorTotal) * t;
        allocate(lines, agreed).forEach((a, i) => {
          const src = lines[i]!;
          expect(a.unitPrice * a.qty).toBeGreaterThanOrEqual(src.minPrice * src.qty - 1);
        });
      }
    }
  });

  it('allocated line totals sum to the agreed total', () => {
    for (const lines of randomBaskets(200)) {
      const agreed = Math.round((listTotalOf(lines) + floorTotalOf(lines)) / 2);
      const sum = allocate(lines, agreed).reduce((s, a) => s + a.unitPrice * a.qty, 0);
      // Per-unit rounding on multi-qty lines costs at most qty/2 rupees a line.
      const tolerance = lines.reduce((s, l) => s + l.qty, 0);
      expect(Math.abs(sum - agreed)).toBeLessThanOrEqual(tolerance);
    }
  });

  it('clamps an absurdly low offer up to the basket floor', () => {
    const sum = allocate(BASKET, 1).reduce((s, a) => s + a.unitPrice * a.qty, 0);
    expect(sum).toBeGreaterThanOrEqual(floorTotalOf(BASKET) - 1);
  });

  it('leaves every line at list when no discount is given', () => {
    allocate(BASKET, listTotalOf(BASKET)).forEach((a, i) =>
      expect(a.unitPrice).toBe(BASKET[i]!.listPrice),
    );
  });

  it('shares the discount out — it does not dump it all on one seller', () => {
    const alloc = allocate(BASKET, listTotalOf(BASKET) - 800);
    expect(alloc.filter((a, i) => a.unitPrice < BASKET[i]!.listPrice).length).toBe(BASKET.length);
  });
});

describe('negotiateBasket', () => {
  it('never quotes below the basket floor or above the basket list', () => {
    for (const lines of randomBaskets(200)) {
      const listTotal = listTotalOf(lines);
      const floorTotal = floorTotalOf(lines);
      for (let turn = 1; turn <= 4; turn += 1) {
        for (const offer of [null, 1, floorTotal / 2, floorTotal, listTotal, listTotal * 2]) {
          for (const extra of [0, 0.3, 9]) {
            const out = negotiateBasket({ lines, turn, buyerOffer: offer, extraConcession: extra });
            expect(out.counterOffer).toBeGreaterThanOrEqual(Math.floor(floorTotal) - 1);
            expect(out.counterOffer).toBeLessThanOrEqual(Math.ceil(listTotal) + 1);
          }
        }
      }
    }
  });

  it('concedes monotonically as turns pass', () => {
    const floors = [1, 2, 3, 4].map(
      (turn) => negotiateBasket({ lines: BASKET, turn, buyerOffer: null }).internalFloorThisTurn,
    );
    for (let i = 1; i < floors.length; i += 1) {
      expect(floors[i]!).toBeLessThanOrEqual(floors[i - 1]! + 1e-6);
    }
  });

  it('accepts at list when the buyer overpays, without discounting', () => {
    const out = negotiateBasket({ lines: BASKET, turn: 1, buyerOffer: 99_999 });
    expect(out.action).toBe('ACCEPT');
    expect(out.counterOffer).toBe(listTotalOf(BASKET));
  });

  it('goes FINAL on the last turn, at or above the basket floor', () => {
    const out = negotiateBasket({ lines: BASKET, turn: 4, buyerOffer: 1 });
    expect(out.action).toBe('FINAL');
    expect(out.counterOffer).toBeGreaterThanOrEqual(floorTotalOf(BASKET));
    expect(out.allocation).toBeDefined();
  });

  it('refuses an empty basket and an inverted price band', () => {
    expect(() => negotiateBasket({ lines: [], turn: 1, buyerOffer: null })).toThrow();
    expect(() => negotiateBasket({ lines: [line('bad', 100, 500)], turn: 1, buyerOffer: null })).toThrow();
  });
});

/**
 * The rule that makes the two haggles safe to coexist: a line already
 * negotiated enters at its LOCKED price, so its remaining range is only what is
 * left down to its floor. Round two cannot undo round one.
 */
describe('no double-dipping when a line was already negotiated', () => {
  it('a fully-haggled basket has no room left and says so', () => {
    // Every line already at its floor: listPrice === minPrice.
    const spent = [line('a', 2600, 2600), line('b', 1900, 1900)];
    const out = negotiateBasket({ lines: spent, turn: 1, buyerOffer: 100 });
    expect(out.remainingRange).toBe(0);
    expect(out.action).toBe('FINAL');
    expect(out.counterOffer).toBe(listTotalOf(spent));
    // And it still hands back an allocation, so the lock path stays uniform.
    expect(out.allocation).toHaveLength(2);
  });

  it('a partly-haggled basket can only improve on the locked price', () => {
    const partly = [
      line('alreadyHaggled', 2700, 2600), // locked at 2700, floor 2600 -> ₹100 left
      line('untouched', 6000, 3500), // full range
    ];
    const listTotal = listTotalOf(partly); // 8700

    for (let turn = 1; turn <= 4; turn += 1) {
      const out = negotiateBasket({ lines: partly, turn, buyerOffer: 1 });
      // Never worse for the buyer than what they already hold...
      expect(out.counterOffer).toBeLessThanOrEqual(listTotal);
      // ...and never through the floors.
      expect(out.counterOffer).toBeGreaterThanOrEqual(floorTotalOf(partly) - 1);
    }

    // The already-haggled line can give at most its remaining ₹100.
    const alloc = allocate(partly, floorTotalOf(partly));
    expect(alloc[0]!.unitPrice).toBeGreaterThanOrEqual(2600);
    expect(alloc[0]!.unitPrice).toBeLessThanOrEqual(2700);
  });

  it('a second round never returns a line above the price already locked', () => {
    const partly = [line('locked', 3000, 2500), line('fresh', 4000, 2000)];
    for (let turn = 1; turn <= 4; turn += 1) {
      const out = negotiateBasket({ lines: partly, turn, buyerOffer: null });
      if (!out.allocation) continue;
      out.allocation.forEach((a, i) => {
        // listPrice here IS the already-locked price — never exceed it.
        expect(a.unitPrice).toBeLessThanOrEqual(partly[i]!.listPrice);
      });
    }
  });
});
