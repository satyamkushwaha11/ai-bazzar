import { describe, it, expect } from 'vitest';
import { negotiate, type EngineInput } from './negotiation';

const base = (over: Partial<EngineInput> = {}): EngineInput => ({
  listPrice: 5000,
  minPrice: 3000,
  turn: 1,
  buyerOffer: null,
  ...over,
});

describe('negotiation engine', () => {
  it('rejects invalid price bands', () => {
    expect(() => negotiate({ ...base(), minPrice: 0 })).toThrow();
    expect(() => negotiate({ ...base(), minPrice: 6000 })).toThrow();
  });

  it('opens near list on turn 1 with no buyer offer', () => {
    const out = negotiate(base());
    expect(out.action).toBe('COUNTER');
    expect(out.counterOffer).toBeGreaterThanOrEqual(4900);
    expect(out.counterOffer).toBeLessThanOrEqual(5000);
  });

  it('NEVER quotes below minPrice across full negotiation tree', () => {
    for (let lp = 100; lp <= 100000; lp += 1373) {
      for (let ratio = 0.05; ratio < 1; ratio += 0.07) {
        const minPrice = Math.round(lp * ratio);
        for (let turn = 1; turn <= 10; turn++) {
          for (const buyerOffer of [null, 0.1 * lp, 0.5 * lp, 0.99 * lp, 1.5 * lp]) {
            const out = negotiate({ listPrice: lp, minPrice, turn, buyerOffer, policy: { maxTurns: 5, aggressiveness: 0.7 } });
            expect(out.counterOffer, `lp=${lp} min=${minPrice} t=${turn} bo=${buyerOffer}`).toBeGreaterThanOrEqual(minPrice);
            if (out.lockedPrice != null) {
              expect(out.lockedPrice).toBeGreaterThanOrEqual(minPrice);
            }
          }
        }
      }
    }
  });

  it('accepts when buyer meets the floor', () => {
    // concessionStep, not turn, drives the curve now: a buyer reaching turn 3
    // by making three improving offers has earned three steps down. Reaching
    // turn 3 by typing "no" three times earns none — see reciprocity.test.ts.
    const out = negotiate(base({ turn: 3, concessionStep: 3, buyerOffer: 4500 }));
    expect(out.action).toBe('ACCEPT');
    expect(out.lockedPrice).toBe(4500);
  });

  it('accepts at list when buyer offers >= list', () => {
    const out = negotiate(base({ turn: 1, buyerOffer: 5500 }));
    expect(out.action).toBe('ACCEPT');
    expect(out.lockedPrice).toBe(5000);
  });

  it('reaches FINAL on the last turn even with low offer', () => {
    const out = negotiate(base({ turn: 4, buyerOffer: 1000, policy: { maxTurns: 4 } }));
    expect(out.action).toBe('FINAL');
    expect(out.counterOffer).toBeGreaterThanOrEqual(3000);
    expect(out.lockedPrice).toBeGreaterThanOrEqual(3000);
  });

  it('floor monotonically concedes across turns', () => {
    let prev = Infinity;
    for (let t = 1; t <= 6; t++) {
      const out = negotiate(base({ turn: t, policy: { maxTurns: 6 } }));
      expect(out.internalFloorThisTurn).toBeLessThanOrEqual(prev + 0.001);
      prev = out.internalFloorThisTurn;
    }
  });

  it('counters above buyer when buyer offer is below floor', () => {
    const out = negotiate(base({ turn: 2, buyerOffer: 3200 }));
    expect(out.action).toBe('COUNTER');
    expect(out.counterOffer).toBeGreaterThan(3200);
    expect(out.counterOffer).toBeLessThanOrEqual(5000);
  });
});
