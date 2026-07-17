import { describe, expect, it } from 'vitest';
import {
  concessionStepFrom,
  isAcceptance,
  negotiate,
  parseOfferFromText,
} from './negotiation';

/**
 * Regression tests for three bugs found in real transcripts. Each `it` below
 * corresponds to something a buyer actually did that the engine mishandled.
 */

describe('parseOfferFromText — a number typed in chat is an offer', () => {
  const LIST = 19_182;

  it('reads the bare number a buyer actually types', () => {
    // The reported transcript: buyer typed "9000" and the engine saw nothing.
    expect(parseOfferFromText('9000', LIST)).toBe(9000);
  });

  it('reads prices with currency markers, commas and k-suffixes', () => {
    expect(parseOfferFromText('₹9,000', LIST)).toBe(9000);
    expect(parseOfferFromText('rs 12000 final', LIST)).toBe(12000);
    expect(parseOfferFromText('15k?', LIST)).toBe(15000);
    expect(parseOfferFromText('9000 me de do bhai', LIST)).toBe(9000);
  });

  it('ignores numbers that are plainly not prices', () => {
    // These are the ones that would break it: quantities and durations.
    expect(parseOfferFromText('can I take 2 pairs?', LIST)).toBeNull();
    expect(parseOfferFromText('is it valid for 10 minutes?', LIST)).toBeNull();
    expect(parseOfferFromText('no', LIST)).toBeNull();
    expect(parseOfferFromText('', LIST)).toBeNull();
  });

  it('ignores an absurd number rather than treating it as an offer', () => {
    expect(parseOfferFromText('my number is 9876543210', LIST)).toBeNull();
  });
});

describe('isAcceptance — yes must mean yes', () => {
  it('recognises plain and Hinglish agreement, including typos', () => {
    for (const s of ['ok', 'okay', 'okya', 'done', 'deal', 'yes', 'haan', 'theek hai', 'chalega', 'sold', 'ok bhai']) {
      expect(isAcceptance(s), s).toBe(true);
    }
  });

  it('does NOT treat a hedged yes as acceptance', () => {
    // A yes carrying a follow-on ask is still a haggle.
    for (const s of [
      'ok but can you do better',
      'ok if you give free shipping',
      'haan lekin thoda kam karo',
      'ok?',
      'okay what about discount',
    ]) {
      expect(isAcceptance(s), s).toBe(false);
    }
  });

  it('does not fire on refusal or an offer', () => {
    for (const s of ['no', 'too costly', '9000', 'nahi']) {
      expect(isAcceptance(s), s).toBe(false);
    }
  });
});

describe('concessionStepFrom — the seller moves only when the buyer moves', () => {
  it('a buyer who never offers earns no concession', () => {
    expect(concessionStepFrom([null, null, null, null])).toBe(1);
  });

  it('each improving offer earns exactly one step', () => {
    expect(concessionStepFrom([9000])).toBe(1);
    expect(concessionStepFrom([9000, 12000])).toBe(2);
    expect(concessionStepFrom([9000, 12000, 13500])).toBe(3);
  });

  it('repeating or lowering an offer earns nothing', () => {
    expect(concessionStepFrom([9000, 9000, 9000])).toBe(1);
    expect(concessionStepFrom([12000, 9000, 8000])).toBe(1);
  });
});

/**
 * The headline regression. Measured from a real session: list ₹19,182, floor
 * ₹13,087. The buyer said "no" three times, made no offer, and extracted the
 * seller's ENTIRE ₹6,095 margin — 32% off for refusing.
 */
describe('refusal must not buy a discount', () => {
  const LIST = 19_182;
  const FLOOR = 13_087;

  it('holds near list across a whole conversation of pure refusal', () => {
    const quotes: number[] = [];
    for (let turn = 1; turn <= 4; turn += 1) {
      quotes.push(
        negotiate({
          listPrice: LIST,
          minPrice: FLOOR,
          turn,
          concessionStep: concessionStepFrom([null, null, null, null].slice(0, turn)),
          buyerOffer: null,
        }).counterOffer,
      );
    }
    // Before the fix this walked 19182 -> 18009 -> 15864 -> 13087.
    const worst = Math.min(...quotes);
    const givenAway = LIST - worst;
    expect(givenAway).toBeLessThan((LIST - FLOOR) * 0.05);
  });

  it('still concedes properly to a buyer who genuinely negotiates', () => {
    // Three improving offers earn three steps down the curve.
    const offers = [9000, 12000, 13500];
    const quote = negotiate({
      listPrice: LIST,
      minPrice: FLOOR,
      turn: 3,
      concessionStep: concessionStepFrom(offers),
      buyerOffer: 13500,
    });
    // Still above the turn-3 floor, so it counters rather than caving — but it
    // counters well below list, which is the point.
    expect(quote.counterOffer).toBeLessThan(LIST);
    expect(quote.counterOffer).toBeGreaterThanOrEqual(FLOOR);
    expect(LIST - quote.counterOffer).toBeGreaterThan((LIST - FLOOR) * 0.4);
  });

  it('a real offer moves the price where a refusal does not', () => {
    const refuse = negotiate({
      listPrice: LIST, minPrice: FLOOR, turn: 3,
      concessionStep: concessionStepFrom([null, null]), buyerOffer: null,
    }).counterOffer;
    const offer = negotiate({
      listPrice: LIST, minPrice: FLOOR, turn: 3,
      concessionStep: concessionStepFrom([9000, 12000]), buyerOffer: null,
    }).counterOffer;
    expect(offer).toBeLessThan(refuse);
  });
});

/**
 * The second reported transcript: the buyer accepted ₹45,572 and the shopkeeper
 * replied with ₹40,196 — bidding against itself. Saying yes must close at the
 * number that was on the table.
 */
describe('acceptance closes at the quoted price', () => {
  it('never answers "ok" with a lower number', () => {
    const LIST = 50_000;
    const FLOOR = 35_000;
    const quoted = 45_572;

    // Acceptance is explicit. Note concessionStep is 1, so the current floor
    // sits ABOVE the quote — passing it as buyerOffer would make the shop
    // counter its own offer, which is exactly the reported bug.
    const out = negotiate({
      listPrice: LIST,
      minPrice: FLOOR,
      turn: 2,
      concessionStep: 1,
      acceptedQuote: quoted,
      buyerOffer: null,
    });

    expect(out.action).toBe('ACCEPT');
    expect(out.counterOffer).toBe(quoted);
    expect(out.lockedPrice).toBe(quoted);
  });

  it('a stale or tampered quote can never open a hole under the floor', () => {
    const out = negotiate({
      listPrice: 50_000,
      minPrice: 35_000,
      turn: 2,
      acceptedQuote: 1, // absurd
      buyerOffer: null,
    });
    expect(out.counterOffer).toBe(35_000);
  });
});
