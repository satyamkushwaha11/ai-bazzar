/**
 * Deterministic negotiation pricing engine.
 *
 * Floor (`minPrice`) NEVER leaves this module. The LLM persona layer
 * receives only the engine's chosen `counterOffer` plus public context.
 *
 * Property invariants (enforced and unit-tested):
 *  - Engine never quotes below `minPrice`.
 *  - Engine never quotes above `listPrice`.
 *  - For a given turn, the floor monotonically decreases (concedes).
 *  - ACCEPT only fires when buyerOffer >= floor(turn).
 */

export type NegotiationAction = 'COUNTER' | 'ACCEPT' | 'REJECT' | 'FINAL';

export interface NegotiationPolicy {
  /** 0=hold firm (slow concession), 1=concede fast. Default 0.5. */
  aggressiveness: number;
  /** Maximum negotiation turns before FINAL. Default 4. */
  maxTurns: number;
  /** Optional cap on discount %. Default null (use minPrice as the only bound). */
  maxDiscountPct?: number | null;
}

export const DEFAULT_POLICY: NegotiationPolicy = {
  aggressiveness: 0.5,
  maxTurns: 4,
  maxDiscountPct: null,
};

export interface EngineInput {
  listPrice: number;
  minPrice: number;
  /** 1-indexed turn number. Ends the conversation at maxTurns. */
  turn: number;
  /** Buyer's most recent offer, if any. */
  buyerOffer: number | null;
  /**
   * How far along the concession curve the seller has agreed to walk.
   *
   * RECIPROCITY — the seller only moves when the BUYER moves. This must be the
   * count of genuine buyer concessions (offers, each improving on the last),
   * NOT the turn number.
   *
   * Driving the curve off `turn` was a real bug: a buyer who simply typed "no"
   * four times extracted the seller's entire margin (measured: ₹19,182 -> the
   * ₹13,087 floor, 32% off) without ever naming a price. Real sellers do not
   * concede to refusal; they concede to movement.
   *
   * Defaults to 1 — hold near list — so a caller that forgets to pass it fails
   * safe for the seller rather than giving the shop away.
   */
  concessionStep?: number;
  /**
   * The buyer said yes to a price the shopkeeper already quoted. Close at it.
   *
   * Handled explicitly rather than by passing the quote back as `buyerOffer`:
   * the concession curve is keyed to reciprocity now, so a quote from an
   * earlier, more generous step sits BELOW the current floor and would be
   * countered — the shop refusing its own offer. A quote that was legitimate
   * when made stays legitimate when accepted.
   *
   * Still clamped to minPrice, so a stale or tampered quote cannot open a hole
   * under the seller's floor.
   */
  acceptedQuote?: number | null;
  policy?: Partial<NegotiationPolicy>;
  /**
   * Extra concession unlocked by seller tactics (volume, bundle, loyalty), as a
   * fraction of the remaining range — see server/ai/strategy.ts.
   *
   * This only ever moves the floor DOWN toward minPrice, never past it: the
   * clamp in floorAtTurn is what keeps the guarantee true no matter what a
   * tactic asks for.
   */
  extraConcession?: number;
}

export interface EngineOutput {
  action: NegotiationAction;
  /** The engine's price for this turn — the LLM must quote this exactly. */
  counterOffer: number;
  /** Internal-only: the lowest the engine would have accepted this turn. Never serialized to client/LLM. */
  internalFloorThisTurn: number;
  /** When ACCEPT/FINAL — the price to lock. */
  lockedPrice?: number;
  reason: string;
}

/** Round to whole rupees so quotes feel natural. */
const round = (n: number) => Math.round(n);

/**
 * Concession curve.
 *
 * floor(turn=1) ≈ ceiling near listPrice (small initial nudge)
 * floor(turn=maxTurns) ≈ minPrice
 *
 * `aggressiveness` shapes the curve: higher = concede faster (convex toward minPrice).
 */
function floorAtTurn(
  input: { listPrice: number; minPrice: number; step: number },
  policy: NegotiationPolicy,
  extra = 0,
) {
  const { listPrice, minPrice, step } = input;
  // `step`, not the turn number: the seller walks down the curve only as far as
  // the buyer's own concessions have earned. See EngineInput.concessionStep.
  const t = Math.max(0, Math.min(1, (step - 1) / Math.max(1, policy.maxTurns - 1)));
  // Convex curve: faster concession early when aggressiveness is high.
  // Exponent in [0.5, 2.5].
  const exponent = 0.5 + (1 - policy.aggressiveness) * 2;
  // Tactics buy the buyer extra ground along the same curve. Clamped to 1 so
  // even a stack of tactics lands exactly ON the floor, never through it.
  const fraction = Math.min(1, Math.pow(t, exponent) + Math.max(0, extra));
  const range = listPrice - minPrice;
  const policyFloor = policy.maxDiscountPct != null ? listPrice * (1 - policy.maxDiscountPct / 100) : minPrice;
  const effectiveMin = Math.max(minPrice, policyFloor);
  const floor = listPrice - range * fraction;
  return Math.max(effectiveMin, floor);
}

export function negotiate(input: EngineInput): EngineOutput {
  const policy = { ...DEFAULT_POLICY, ...(input.policy ?? {}) };
  const { listPrice, minPrice, turn, buyerOffer } = input;

  if (!(minPrice > 0) || !(listPrice >= minPrice)) {
    throw new Error('Invalid price band: require 0 < minPrice <= listPrice');
  }

  const step = input.concessionStep ?? 1;
  const floor = floorAtTurn({ listPrice, minPrice, step }, policy, input.extraConcession ?? 0);
  const isFinalTurn = turn >= policy.maxTurns;

  // The buyer accepted a price already on the table. Honour it and stop — never
  // re-quote, and never undercut your own offer just because a turn elapsed.
  if (input.acceptedQuote != null && input.acceptedQuote > 0) {
    const lock = Math.min(listPrice, Math.max(minPrice, input.acceptedQuote));
    return {
      action: 'ACCEPT',
      counterOffer: round(lock),
      internalFloorThisTurn: floor,
      lockedPrice: round(lock),
      reason: 'buyer_accepted_quote',
    };
  }

  // Buyer offered: decide ACCEPT / COUNTER / REJECT
  if (buyerOffer != null && buyerOffer > 0) {
    if (buyerOffer >= listPrice) {
      // Generous buyer — accept at list (no need to discount).
      return {
        action: 'ACCEPT',
        counterOffer: round(listPrice),
        internalFloorThisTurn: floor,
        lockedPrice: round(listPrice),
        reason: 'buyer_offer_at_or_above_list',
      };
    }
    if (buyerOffer >= floor) {
      // Meet in the middle — accept, but never below minPrice.
      const lock = Math.max(minPrice, buyerOffer);
      return {
        action: 'ACCEPT',
        counterOffer: round(lock),
        internalFloorThisTurn: floor,
        lockedPrice: round(lock),
        reason: 'buyer_offer_above_floor',
      };
    }
    // Below floor.
    if (isFinalTurn) {
      // FINAL take-it-or-leave-it at engine's floor (>= minPrice always).
      return {
        action: 'FINAL',
        counterOffer: round(floor),
        internalFloorThisTurn: floor,
        lockedPrice: round(floor),
        reason: 'final_turn_below_floor',
      };
    }
    // Counter halfway between buyer offer and floor, but never below floor.
    const counter = Math.max(floor, (buyerOffer + floor) / 2);
    return {
      action: 'COUNTER',
      counterOffer: round(Math.min(listPrice, counter)),
      internalFloorThisTurn: floor,
      reason: 'counter_above_buyer',
    };
  }

  // No buyer offer yet — opening move from the shopkeeper.
  if (turn === 1) {
    /*
     * Without a tactic in play, hold near list: a tiny goodwill nudge and no
     * more. That is the anchor.
     *
     * But when a tactic HAS unlocked room (volume, bundle, loyalty), pass it on
     * immediately by quoting the tactic-adjusted floor. Holding at the anchor
     * here would silently swallow the concession — `max(floor, opener)` keeps
     * the higher opener — so a buyer asking for 5 units on turn 1 would be
     * quoted the same price as one asking for 1, and the volume pitch would be
     * a lie. The floor already includes `extraConcession`, so quoting it IS the
     * volume price, and it still cannot go below the seller's real floor.
     */
    const hasTactic = (input.extraConcession ?? 0) > 0;
    const opener = hasTactic ? floor : listPrice * (1 - 0.02 * policy.aggressiveness);
    return {
      action: 'COUNTER',
      counterOffer: round(Math.max(floor, opener)),
      internalFloorThisTurn: floor,
      reason: hasTactic ? 'opener_with_tactic' : 'opener_near_list',
    };
  }

  if (isFinalTurn) {
    return {
      action: 'FINAL',
      counterOffer: round(floor),
      internalFloorThisTurn: floor,
      lockedPrice: round(floor),
      reason: 'final_no_offer',
    };
  }

  return {
    action: 'COUNTER',
    counterOffer: round(floor),
    internalFloorThisTurn: floor,
    reason: 'counter_at_floor',
  };
}

/**
 * Did the buyer just say yes?
 *
 * Without this, "ok" was simply another elapsed turn: the engine advanced its
 * curve and quoted LOWER than the number the buyer had just accepted — the shop
 * bidding against itself (measured: buyer accepted ₹45,572, engine replied
 * ₹40,196). Agreement has to close the deal, not trigger a discount.
 *
 * Deliberately conservative. It must not fire on "ok but can you do better" or
 * "haan, thoda kam karo" — a hedged yes is still a haggle, so anything carrying
 * a follow-on ask is not acceptance.
 */
export function isAcceptance(buyerMessage: string): boolean {
  const m = buyerMessage.toLowerCase().trim().replace(/[!.,]+$/, '');
  if (!m || m.length > 40) return false;

  // A yes that carries a request is not a yes.
  const hedges = [
    'but', 'if', 'agar', 'lekin', 'par ', 'kam', 'less', 'better', 'discount',
    'aur', 'more', 'free', 'kitna', 'how about', 'what about', '?',
  ];
  if (hedges.some((h) => m.includes(h))) return false;

  const yes = [
    'ok', 'okay', 'okey', 'okya', 'k', 'kk', 'done', 'deal', 'deal done', 'fine',
    'agreed', 'agree', 'yes', 'yep', 'yeah', 'sure', 'accept', 'accepted',
    'i accept', 'take it', "i'll take it", 'ill take it', 'sold',
    'haan', 'han', 'ha', 'theek', 'thik', 'theek hai', 'thik hai', 'chalega',
    'chalo', 'pakka', 'set', 'book it', 'confirm', 'confirmed', 'lets go',
    "let's go", 'go ahead', 'ok done', 'ok deal', 'ok fine',
  ];
  return yes.includes(m) || yes.some((y) => m === `${y} bhai` || m === `${y} sir`);
}

/**
 * Pull a price out of a free-text message.
 *
 * Buyers type "9000" into the chat rather than hunting for the ₹ field, and
 * before this that number was invisible to the engine — it answered a customer
 * who, as far as it knew, had said nothing at all.
 *
 * Bounded by the list price on purpose: it stops "take 2 pairs" becoming a ₹2
 * offer and "valid for 10 minutes" becoming ₹10, without needing to understand
 * the sentence.
 */
export function parseOfferFromText(text: string, listPrice: number): number | null {
  if (!text || listPrice <= 0) return null;

  // ₹9,000 | rs 9000 | 9000 | 9k | 9.5k
  const re = /(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand)?/gi;
  const lo = listPrice * 0.05; // below this it's a quantity or a duration, not a price
  const hi = listPrice * 1.5; // above this it's a phone number or a typo

  for (const m of text.matchAll(re)) {
    const raw = Number(m[1]!.replace(/,/g, ''));
    if (!Number.isFinite(raw)) continue;
    const value = m[2] ? raw * 1000 : raw;
    if (value >= lo && value <= hi) return Math.round(value);
  }
  return null;
}

/**
 * How far the seller has agreed to walk down the curve.
 *
 * RECIPROCITY: one step per genuine buyer concession — an offer that improves
 * on their previous best. Refusals ("no", "too costly") earn nothing, which is
 * how real haggling works and what stops a buyer farming the entire margin by
 * typing "no" four times.
 */
export function concessionStepFrom(buyerOffers: Array<number | null | undefined>): number {
  let step = 1;
  let best = -Infinity;
  for (const o of buyerOffers) {
    if (o == null || !(o > 0)) continue;
    if (o > best) {
      // They moved toward the seller — reward it.
      if (best !== -Infinity) step += 1;
      best = o;
    }
  }
  return step;
}

/**
 * Heuristic prompt-injection / abuse pre-filter.
 * Catches the common "ignore previous instructions" / "what is your minimum" patterns
 * before the buyer message reaches the LLM.
 */
export function isSuspicious(buyerMessage: string): boolean {
  const m = buyerMessage.toLowerCase();
  const patterns = [
    'ignore previous',
    'ignore all previous',
    'system prompt',
    'minimum price',
    'min price',
    'what is your floor',
    'your floor price',
    'reveal your',
    'lowest you can',
    'developer mode',
    'jailbreak',
  ];
  return patterns.some((p) => m.includes(p));
}
